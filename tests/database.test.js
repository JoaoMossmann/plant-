import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL: isolamento por conta, proteção de escrita, revisão e caminhos privados", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id text primary key,bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated; create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610210001_private_gardens.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610210002_validate_payload.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  const plant = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Maranta",
    species: "Maranta leuconeura",
    acquired: "2026-01-01",
    interval: 5,
    history: [],
    photoPath: null,
  };
  await asUser(a);
  for (const bad of [
    { ...plant, name: 123 },
    { ...plant, interval: null },
    { ...plant, acquired: null },
    { ...plant, history: [{ type: "Rega", date: null }] },
    { ...plant, history: null },
  ]) {
    await assert.rejects(() =>
      db.query("select public.save_my_garden(0,$1::jsonb)", [
        JSON.stringify([bad]),
      ]),
    );
  }
  assert.equal(
    (
      await db.query("select public.save_my_garden(0,$1::jsonb) as v", [
        JSON.stringify([plant]),
      ])
    ).rows[0].v,
    1,
  );
  await assert.rejects(
    () =>
      db.query("select public.save_my_garden(0,$1::jsonb)", [
        JSON.stringify([plant]),
      ]),
    (e) => e.code === "40001",
  );
  await db.query(
    "insert into storage.objects values('one','plant-photos',$1)",
    [a + "/photo.jpg"],
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into storage.objects values('forged','plant-photos',$1)",
        [b + "/photo.jpg"],
      ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("update public.gardens set plants='[]'"),
    (e) => e.code === "42501",
  );
  await asUser(b);
  assert.equal((await db.query("select * from public.gardens")).rows.length, 0);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await db.exec("delete from storage.objects");
  await assert.rejects(
    () =>
      db.query("select public.save_my_garden(0,$1::jsonb)", [
        JSON.stringify([
          {
            ...plant,
            photoPath: a + "/33333333-3333-4333-8333-333333333333.jpg",
          },
        ]),
      ]),
    /Invalid photo owner/,
  );
  assert.equal(
    (
      await db.query("select public.save_my_garden(0,$1::jsonb) as v", [
        JSON.stringify([]),
      ])
    ).rows[0].v,
    1,
  );
  await asUser(a);
  assert.equal(
    (await db.query("select count(*)::int n from storage.objects")).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query("select public.save_my_garden(1,$1::jsonb) as v", [
        JSON.stringify([]),
      ])
    ).rows[0].v,
    2,
  );
  await assert.rejects(
    () =>
      db.query("select public.save_my_garden(1,$1::jsonb)", [
        JSON.stringify([plant]),
      ]),
    (e) => e.code === "40001",
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role anon");
  await assert.rejects(
    () => db.query("select * from public.gardens"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("select public.save_my_garden(0,'[]')"),
    (e) => e.code === "42501",
  );
  await db.close();
});
