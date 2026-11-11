import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createCloudGarden } from "../src/lib/cloud-garden.js";
import { createProfileStore } from "../src/lib/profile.js";

test("limites no PostgreSQL: saldo, reposição, cota diária, isolamento e rollback", async (t) => {
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
    create table storage.objects(id text primary key,bucket_id text,name text,metadata jsonb);
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
    "202611110001_account_deletion.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );

  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())",
    [a, b],
  );
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  async function budget(operation) {
    await db.exec("reset role");
    return (
      await db.query(
        "select * from app_private.write_budgets where user_id=$1 and operation=$2",
        [a, operation],
      )
    ).rows[0];
  }
  async function configureBudget(operation, assignments) {
    await db.exec("reset role");
    await db.exec(
      `update app_private.write_budgets set ${assignments} where user_id='${a}' and operation='${operation}'`,
    );
    await asUser(a);
  }
  const limited = (error) => error.code === "PT429";
  await asUser(a);
  // Mesmo timestamp durante a transação: todas as gravações chegam em uma rajada.
  await db.exec("begin");
  for (let revision = 0; revision < 30; revision++)
    await db.query("select public.save_my_garden($1,'[]')", [revision]);
  await db.exec("commit");
  await assert.rejects(
    () => db.query("select public.save_my_garden(30,'[]')"),
    limited,
  );
  assert.equal(
    (await db.query("select version from public.gardens")).rows[0].version,
    30,
  );
  assert.equal((await budget("garden")).daily_writes, 30);

  // O bloqueio de A não afeta B; B também não pode debitar ou zerar o saldo de A.
  await asUser(b);
  await db.query("select public.save_my_garden(0,'[]')");
  for (const sql of [
    "select * from app_private.write_budgets",
    "update app_private.write_budgets set tokens=30",
    "delete from app_private.write_budgets",
    "select app_private.limit_account_writes()",
  ])
    await assert.rejects(
      () => db.query(sql),
      (e) => e.code === "42501",
    );

  // Reposição gradual: 3 segundos disponibilizam 1,5 token de jardim.
  await configureBudget(
    "garden",
    "tokens=0,refilled_at=statement_timestamp()-interval '3 seconds'",
  );
  await db.query("select public.save_my_garden(30,'[]')");
  await assert.rejects(
    () => db.query("select public.save_my_garden(31,'[]')"),
    limited,
  );
  await configureBudget("garden", "tokens=30,daily_writes=2000");
  await assert.rejects(
    () => db.query("select public.save_my_garden(31,'[]')"),
    limited,
  );
  await configureBudget("garden", "tokens=30,write_day=write_day-1");
  await db.query("select public.save_my_garden(31,'[]')");
  assert.equal((await budget("garden")).daily_writes, 1);

  await asUser(a);
  // Erro posterior ao débito e rollback explícito não consomem o saldo.
  const beforeRollback = (await budget("garden")).daily_writes;
  await asUser(a);
  await db.exec("begin");
  await db.query("select public.save_my_garden(32,'[]')");
  await db.exec("rollback");
  assert.equal((await budget("garden")).daily_writes, beforeRollback);

  await asUser(a);
  await assert.rejects(
    () =>
      db.query(
        "insert into public.profiles(user_id,handle,display_name) values($1,'admin','Nome')",
        [a],
      ),
    (e) => e.code === "23514",
  );
  assert.equal(await budget("profile"), undefined);
  await asUser(a);
  await db.exec("begin");
  await db.query(
    "insert into public.profiles(user_id,handle,display_name) values($1,'jardim_a','Nome')",
    [a],
  );
  for (let i = 0; i < 9; i++)
    await db.query("update public.profiles set bio='Teste' where user_id=$1", [
      a,
    ]);
  await db.exec("commit");
  await assert.rejects(
    () =>
      db.query("update public.profiles set bio='Bloqueado' where user_id=$1", [
        a,
      ]),
    limited,
  );
  assert.equal(
    (await db.query("select bio from public.profiles where user_id=$1", [a]))
      .rows[0].bio,
    "Teste",
  );
  await configureBudget("profile", "tokens=10,daily_writes=100");
  await assert.rejects(
    () => db.query("update public.profiles set bio='' where user_id=$1", [a]),
    limited,
  );
  await configureBudget("profile", "tokens=10,write_day=write_day-1");
  await db.query("update public.profiles set bio='' where user_id=$1", [a]);
  assert.equal((await budget("profile")).daily_writes, 1);

  // O inventário lê metadados em uma transação somente leitura.
  const inventory = await db.exec(
    await readFile(
      new URL("../supabase/checks/security_inventory.sql", import.meta.url),
      "utf8",
    ),
  );
  const reports = inventory.flatMap((result) => result.rows || []);
  assert.equal(reports.length, 1);
  const report = reports[0].security_inventory;
  const tables = report.tables;
  assert.equal(tables.length, 10);
  assert.ok(tables.every((row) => row.installed && row.rls_enabled));
  assert.ok(report.policies.some((row) => row.tablename === "gardens"));
  assert.ok(
    report.table_permissions.some((row) => row.table_name === "gardens"),
  );
  assert.ok(
    report.column_permissions.some((row) => row.column_name === "handle"),
  );
  assert.ok(
    report.functions.some(
      (row) => row.proname === "save_my_garden" && row.security_definer,
    ),
  );
  assert.ok(
    report.triggers.some((row) => row.trigger_name === "limit_garden_writes"),
  );
  assert.equal(report.buckets[0].public, false);
  assert.equal(report.buckets[0].file_size_limit, 2097152);
  await db.query("delete from auth.users where id=$1", [a]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from app_private.write_budgets where user_id=$1",
        [a],
      )
    ).rows[0].n,
    0,
  );
});

test("jardim e perfil explicam limites sem expor detalhes internos do banco", async () => {
  const error = { code: "PT429", message: "internal database detail" };
  const garden = createCloudGarden(
    {
      storage: { from: () => ({}) },
      rpc: async () => ({ error }),
    },
    "owner",
  );
  await assert.rejects(() => garden.save([], []), /limite de alterações/);
  const profile = createProfileStore(
    {
      from: () => ({
        insert() {
          return this;
        },
        select() {
          return this;
        },
        single: async () => ({ error }),
      }),
    },
    "owner",
  );
  await assert.rejects(
    () => profile.save({ handle: "jardim_a", display_name: "Nome" }, null),
    /limite de alterações/,
  );
});

test("rejeição por limite tenta remover somente as fotos enviadas nessa tentativa", async () => {
  const uploaded = [];
  const removed = [];
  const garden = createCloudGarden(
    {
      storage: {
        from: () => ({
          upload: async (path) => {
            uploaded.push(path);
            return { error: null };
          },
          remove: async (paths) => {
            removed.push(...paths);
            return { error: null };
          },
        }),
      },
      rpc: async () => ({ error: { code: "PT429" } }),
    },
    "owner",
  );
  await assert.rejects(
    () =>
      garden.save(
        [
          {
            id: "plant",
            photo: "data:image/jpeg;base64,/9j/",
          },
        ],
        [],
      ),
    /limite de alterações/,
  );
  assert.equal(uploaded.length, 1);
  assert.deepEqual(removed, uploaded);
});
