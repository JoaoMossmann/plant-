import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("fotos: cotas, reservas, bloqueio de Storage direto e exclusão consistente no PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id text primary key,bucket_id text,name text,metadata jsonb,created_at timestamptz default now());
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
  `);
  for (const file of [
    "202610210001_private_gardens.sql",
    "202610210002_validate_payload.sql",
    "202611040001_community_foundation.sql",
    "202611060001_write_limits.sql",
    "202611100001_protected_photos.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const c = "33333333-3333-4333-8333-333333333333";
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,null)",
    [a, b, c],
  );
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(id ? "set role authenticated" : "set role anon");
  }
  async function resetFixtures() {
    await db.exec(
      "reset role; delete from storage.objects; delete from app_private.photo_reservations; delete from app_private.photo_tombstones; delete from app_private.write_budgets where operation like 'photo_%'",
    );
    await asUser(a);
  }
  const reserve = () => db.query("select public.reserve_my_photo() as path");
  const code = (expected) => (error) => error.code === expected;

  await t.test(
    "confirmação, reservas privadas, identidade e limite de frequência",
    async () => {
      await asUser("");
      await assert.rejects(reserve, code("42501"));
      await asUser(c);
      await assert.rejects(reserve, code("42501"));
      await asUser(a);
      const path = (await reserve()).rows[0].path;
      assert.match(path, new RegExp("^" + a + "/[0-9a-f-]{36}\\.jpg$"));
      await assert.rejects(
        () => db.query("select * from app_private.photo_reservations"),
        code("42501"),
      );
      await assert.rejects(
        () => db.query("delete from app_private.photo_tombstones"),
        code("42501"),
      );
      await assert.rejects(
        () =>
          db.query("select public.finish_photo_reservation($1,false)", [path]),
        code("42501"),
      );
      for (let i = 0; i < 4; i++) await reserve();
      await assert.rejects(reserve, code("PT429"));
      await asUser(b);
      await reserve();
      await assert.rejects(
        () => db.query("select public.authorize_my_photo($1)", [path]),
        code("42501"),
      );
      await assert.rejects(
        () => db.query("select public.prepare_my_photo_removal($1)", [[path]]),
        code("42501"),
      );
    },
  );

  await t.test(
    "reservas ocupam espaço, arquivos antigos e órfãos entram na cota",
    async () => {
      await resetFixtures();
      await db.exec("reset role");
      await db.query(
        "insert into app_private.photo_reservations(path,user_id) select $1||'/'||gen_random_uuid()||'.jpg',$1::uuid from generate_series(1,24)",
        [a],
      );
      await asUser(a);
      await reserve();
      await assert.rejects(reserve, code("PT413"));

      await resetFixtures();
      await db.exec("reset role");
      await db.query(
        "insert into storage.objects(id,bucket_id,name,metadata) select gen_random_uuid()::text,'plant-photos',$1||'/'||gen_random_uuid()||'.jpg','{\"size\":2097152}' from generate_series(1,25)",
        [a],
      );
      await asUser(a);
      await assert.rejects(reserve, code("PT413"));

      await resetFixtures();
      await db.exec("reset role");
      await db.query(
        "insert into storage.objects(id,bucket_id,name,metadata) select gen_random_uuid()::text,'plant-photos',$1||'/'||gen_random_uuid()||'.jpg','{\"size\":1}' from generate_series(1,100)",
        [a],
      );
      await asUser(a);
      await assert.rejects(reserve, code("PT413"));
      await asUser(b);
      await reserve();
    },
  );

  await t.test(
    "cota global e metadados ausentes não deixam espaço ilimitado",
    async () => {
      await resetFixtures();
      await db.exec("reset role");
      await db.query(
        "insert into storage.objects values('global','plant-photos',$1,'{\"size\":524288000}',now())",
        [b + "/" + crypto.randomUUID() + ".jpg"],
      );
      await asUser(a);
      await assert.rejects(reserve, code("PT413"));
      await resetFixtures();
      await db.exec("reset role");
      await db.query(
        "insert into storage.objects(id,bucket_id,name,metadata) select gen_random_uuid()::text,'plant-photos',$1||'/'||gen_random_uuid()||'.jpg','{}' from generate_series(1,25)",
        [a],
      );
      await asUser(a);
      await assert.rejects(reserve, code("PT413"));
    },
  );

  await t.test(
    "uma reserva com objeto já criado não conta duas vezes",
    async () => {
      await resetFixtures();
      await db.exec("reset role");
      await db.query(
        "insert into storage.objects(id,bucket_id,name,metadata) select gen_random_uuid()::text,'plant-photos',$1||'/'||gen_random_uuid()||'.jpg','{\"size\":2097152}' from generate_series(1,24)",
        [a],
      );
      await db.query(
        "insert into app_private.photo_reservations select name,$1,now() from storage.objects limit 1",
        [a],
      );
      await asUser(a);
      await reserve();
      await assert.rejects(reserve, code("PT413"));
    },
  );

  await t.test(
    "Storage direto fechado; foto em uso protegida; remoção bloqueia novas referências",
    async () => {
      await resetFixtures();
      const path = (await reserve()).rows[0].path;
      await assert.rejects(
        () =>
          db.query(
            "insert into storage.objects values('bypass','plant-photos',$1,'{}',now())",
            [path],
          ),
        code("42501"),
      );
      await db.exec("reset role");
      await db.query(
        "insert into storage.objects values('real','plant-photos',$1,'{\"size\":1000}',now())",
        [path],
      );
      await db.query("select public.finish_photo_reservation($1,true)", [path]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from app_private.photo_reservations",
          )
        ).rows[0].n,
        0,
      );
      await asUser(a);
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        0,
      );
      await db.query("delete from storage.objects where name=$1", [path]);
      await db.query("select public.authorize_my_photo($1)", [path]);
      const plant = {
        id: crypto.randomUUID(),
        name: "Maranta",
        species: "Maranta leuconeura",
        acquired: "2026-01-01",
        interval: 7,
        history: [],
        photoPath: path,
      };
      await db.query("select public.save_my_garden(0,$1)", [
        JSON.stringify([plant]),
      ]);
      await assert.rejects(
        () => db.query("select public.prepare_my_photo_removal($1)", [[path]]),
        code("PT409"),
      );
      await db.query("select public.save_my_garden(1,'[]')");
      // Mesmo que a chamada HTTP de limpeza se perca, a retirada do jardim já bloqueia a foto.
      await assert.rejects(
        () => db.query("select public.authorize_my_photo($1)", [path]),
        code("PT404"),
      );
      await db.query("select public.prepare_my_photo_removal($1)", [[path]]);
      await assert.rejects(
        () => db.query("select public.authorize_my_photo($1)", [path]),
        code("PT404"),
      );
      await assert.rejects(
        () =>
          db.query("select public.save_my_garden(2,$1)", [
            JSON.stringify([plant]),
          ]),
        code("PT409"),
      );
      assert.deepEqual(
        (await db.query("select public.pending_my_photo_removals() as paths"))
          .rows[0].paths,
        [path],
      );
      await db.exec("reset role");
      assert.equal(
        (await db.query("select count(*)::int as n from storage.objects"))
          .rows[0].n,
        1,
      );
      await db.query("delete from storage.objects where name=$1", [path]);
      await asUser(a);
      assert.deepEqual(
        (await db.query("select public.pending_my_photo_removals() as paths"))
          .rows[0].paths,
        [],
      );
      await db.exec("reset role");
      await db.query("delete from auth.users where id=$1", [a]);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from app_private.photo_tombstones",
          )
        ).rows[0].n,
        0,
      );
    },
  );
});
