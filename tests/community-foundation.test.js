import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("comunidade: perfis privados de visitantes, propriedade, confirmação, bloqueios e suspensão", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id text primary key,bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated; create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  for (const file of [
    "202610210001_private_gardens.sql",
    "202610210002_validate_payload.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    c = "33333333-3333-4333-8333-333333333333";
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now()),($3,null)",
    [a, b, c],
  );
  // Pré-existência de jardim/foto privada para detectar qualquer divulgação pela migração.
  const privateGarden = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Somente minha",
      species: "Maranta leuconeura",
      acquired: "2026-01-01",
      interval: 7,
      history: [],
      notes: "Nota privada",
    },
  ];
  await db.query(
    "insert into public.gardens(user_id,plants) values($1,$2::jsonb)",
    [a, JSON.stringify(privateGarden)],
  );
  await db.query(
    "insert into storage.objects values('private','plant-photos',$1)",
    [a + "/private.jpg"],
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611040001_community_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  await asUser(a);
  await db.query(
    "insert into public.profiles(user_id,handle,display_name,city_id) values($1,$2,$3,$4)",
    [a, "jardim_a", "Jardim A", "sao-leopoldo-rs"],
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.profiles(user_id,handle,display_name) values($1,$2,$3)",
        [b, "forjado", "Outro dono"],
      ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      db.query("update public.profiles set user_id=$1 where user_id=$2", [
        b,
        a,
      ]),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("update public.profiles set created_at=now()"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("update public.profiles set handle='admin'"),
    (e) => e.code === "23514",
  );
  await assert.rejects(
    () => db.query("update public.profiles set handle='ABC invalid'"),
    (e) => e.code === "23514",
  );
  await assert.rejects(
    () => db.query("update public.profiles set city_id='cidade-inexistente'"),
    (e) => e.code === "23503",
  );
  await assert.rejects(
    () => db.query("update public.profiles set bio=$1", ["x".repeat(501)]),
    (e) => e.code === "23514",
  );
  await asUser(b);
  await db.query(
    "insert into public.profiles(user_id,handle,display_name) values($1,$2,$3)",
    [b, "jardim_b", "Jardim B"],
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query(
        "update public.profiles set display_name=$1 where user_id=$2 returning user_id",
        ["Não autorizado", a],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        "update public.profiles set handle='jardim_a' where user_id=$1",
        [b],
      ),
    (e) => e.code === "23505",
  );
  assert.equal((await db.query("select * from public.gardens")).rows.length, 0);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(
    () => db.query("select * from auth.users"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into app_private.community_account_status(user_id,status) values($1,'active')",
        [b],
      ),
    (e) => e.code === "42501",
  );
  await asUser(c);
  assert.equal(
    (await db.query("select * from public.profiles")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.profiles(user_id,handle,display_name) values($1,$2,$3)",
        [c, "nao_confirmado", "Não confirmado"],
      ),
    (e) => e.code === "42501",
  );
  await asUser(a);
  await assert.rejects(
    () =>
      db.query(
        "insert into public.member_blocks(blocker_id,blocked_id) values($1,$2)",
        [b, a],
      ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.member_blocks(blocker_id,blocked_id) values($1,$1)",
        [a],
      ),
    (e) => e.code === "23514",
  );
  await db.query(
    "insert into public.member_blocks(blocker_id,blocked_id) values($1,$2)",
    [a, b],
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    1,
  );
  await asUser(b);
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select * from public.member_blocks")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("delete from public.member_blocks returning blocker_id"))
      .rows.length,
    0,
  );
  await asUser(a);
  await db.query("delete from public.member_blocks");
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    2,
  );
  await db.exec("reset role; set role service_role");
  await db.query(
    "insert into app_private.community_account_status(user_id,status) values($1,'suspended')",
    [b],
  );
  await asUser(a);
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    1,
  );
  // A migração não altera os dados do jardim nem as políticas das fotos.
  assert.deepEqual(
    (await db.query("select plants from public.gardens")).rows[0].plants,
    privateGarden,
  );
  assert.equal(
    (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
    1,
  );
  await asUser(b);
  assert.equal(
    (await db.query("select count(*)::int n from public.profiles")).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "update public.profiles set display_name='Suspenso' returning user_id",
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.member_blocks(blocker_id,blocked_id) values($1,$2)",
        [b, a],
      ),
    (e) => e.code === "42501",
  );
  await db.exec("reset role");
  await db.query("update auth.users set deleted_at=now() where id=$1", [b]);
  await asUser(b);
  assert.equal(
    (await db.query("select * from public.profiles")).rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query("update auth.users set deleted_at=null where id=$1", [b]);
  await db.exec("reset role; set role anon");
  assert.equal(
    (await db.query("select count(*)::int n from public.cities")).rows[0].n,
    4,
  );
  await assert.rejects(
    () => db.query("select * from public.profiles"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("select * from public.member_blocks"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () =>
      db.query("insert into public.cities values('forjada','Forjada','RS')"),
    (e) => e.code === "42501",
  );
  await db.exec("reset role");
  await db.query("delete from auth.users where id=$1", [a]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.profiles where user_id=$1",
        [a],
      )
    ).rows[0].n,
    0,
  );
  const columns = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='profiles'",
    )
  ).rows.map((r) => r.column_name);
  for (const sensitive of [
    "email",
    "phone",
    "password",
    "role",
    "status",
    "latitude",
    "longitude",
  ])
    assert.ok(!columns.includes(sensitive));
  await db.close();
});
