import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("exclusão no PostgreSQL: tentativas, uploads concorrentes, bloqueio persistente e cascata", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id text primary key,bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  for (const file of [
    "202610210001_private_gardens.sql",
    "202610210002_validate_payload.sql",
    "202611040001_community_foundation.sql",
    "202611060001_write_limits.sql",
    "202611100001_protected_photos.sql",
    "202611110001_account_deletion.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())",
    [a, b],
  );
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(id ? "set role authenticated" : "set role anon");
  }
  const denied = (e) => e.code === "42501";
  await asUser("");
  await assert.rejects(
    () => db.query("select public.authorize_my_account_deletion()"),
    denied,
  );
  await asUser(a);
  for (let i = 0; i < 3; i++)
    await db.query("select public.authorize_my_account_deletion()");
  await assert.rejects(
    () => db.query("select public.authorize_my_account_deletion()"),
    (e) => e.code === "PT429",
  );
  await assert.rejects(
    () => db.query("select public.begin_account_deletion($1)", [a]),
    denied,
  );
  await assert.rejects(
    () => db.query("select * from app_private.account_deletions"),
    denied,
  );
  const pending = (await db.query("select public.reserve_my_photo() as path"))
    .rows[0].path;
  await db.query("select public.save_my_garden(0,'[]')");
  await db.query(
    "insert into public.profiles(user_id,handle,display_name) values($1,'jardim_a','Jardim A')",
    [a],
  );
  await db.query(
    "insert into public.member_blocks(blocker_id,blocked_id) values($1,$2)",
    [a, b],
  );
  await db.exec("reset role");
  await assert.rejects(
    () => db.query("select public.begin_account_deletion($1)", [a]),
    (e) => e.code === "PT409",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from app_private.account_deletions",
      )
    ).rows[0].n,
    0,
  );
  await db.query("select public.finish_photo_reservation($1,false)", [pending]);
  const oldPhoto = a + "/" + crypto.randomUUID() + ".jpg";
  await db.query(
    "insert into storage.objects values('photo','plant-photos',$1,'{\"size\":1000}')",
    [oldPhoto],
  );
  await db.exec("set role service_role");
  await db.query("select public.begin_account_deletion($1)", [a]);
  await db.query("select public.begin_account_deletion($1)", [a]);
  await asUser(a);
  assert.equal((await db.query("select * from public.gardens")).rows.length, 0);
  assert.equal(
    (await db.query("select * from public.profiles")).rows.length,
    0,
  );
  await assert.rejects(
    () => db.query("select public.reserve_my_photo()"),
    denied,
  );
  await assert.rejects(
    () => db.query("select public.authorize_my_photo($1)", [oldPhoto]),
    denied,
  );
  await assert.rejects(
    () => db.query("select public.save_my_garden(1,'[]')"),
    denied,
  );
  // Uma reserva que já passou pela conferência anterior ao lock também não pode ser inserida.
  await db.exec("reset role");
  await assert.rejects(
    () =>
      db.query(
        "insert into app_private.photo_reservations(path,user_id) values($1,$2)",
        [pending, a],
      ),
    denied,
  );
  await asUser(b);
  await db.query("select public.authorize_my_account_deletion()");
  assert.equal(
    (await db.query("select * from public.profiles where user_id=$1", [a])).rows
      .length,
    0,
  );
  await db.query("select public.save_my_garden(0,'[]')");
  await db.query(
    "insert into public.profiles(user_id,handle,display_name) values($1,'jardim_b','Jardim B')",
    [b],
  );
  await db.exec("reset role");
  await db.query("delete from storage.objects where name=$1", [oldPhoto]);
  await db.query("delete from auth.users where id=$1", [a]);
  for (const table of [
    "public.gardens",
    "public.profiles",
    "app_private.account_deletions",
    "app_private.write_budgets",
    "app_private.photo_reservations",
  ])
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from ${table} where user_id=$1`,
          [a],
        )
      ).rows[0].n,
      0,
    );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.member_blocks where blocker_id=$1 or blocked_id=$1",
        [a],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from public.profiles where user_id=$1",
        [b],
      )
    ).rows[0].n,
    1,
  );
});
