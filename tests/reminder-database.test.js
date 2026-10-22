import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("preferências privadas e seleção de lembretes no servidor respeitam consentimento e fuso", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; create table public.gardens(user_id uuid primary key references auth.users(id),plants jsonb);`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610220001_reminder_preferences.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  const plant = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Jiboia",
    acquired: "2026-10-01",
    lastWatered: "2026-10-15",
    interval: 7,
  };
  await db.query("insert into auth.users values($1),($2)", [a, b]);
  await db.query(
    "insert into public.gardens values($1,$2::jsonb),($3,$2::jsonb)",
    [a, JSON.stringify([plant]), b],
  );
  async function asUser(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  await asUser(a);
  await assert.rejects(
    () =>
      db.query(
        "select public.save_my_reminder_preferences('America/Sao_Paulo',9,true)",
      ),
    /not configured/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.save_my_reminder_preferences('Invalid\/Zone',9,false)",
      ),
    /Invalid time zone/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select public.save_my_reminder_preferences('America/Sao_Paulo',25,false)",
      ),
    /Invalid reminder/,
  );
  await db.query(
    "select public.save_my_reminder_preferences('America/Sao_Paulo',9,false)",
  );
  await assert.rejects(
    () => db.query("select * from public.reminder_service_config"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("select * from public.due_reminder_candidates(now())"),
    (e) => e.code === "42501",
  );
  await db.exec("reset role");
  await db.exec(
    "update public.reminder_service_config set ready=true,daily_limit=5,provider='test-fixture'",
  );
  await asUser(a);
  await db.query(
    "select public.save_my_reminder_preferences('America/Sao_Paulo',9,true)",
  );
  await asUser(b);
  assert.equal(
    (await db.query("select * from public.reminder_preferences")).rows.length,
    0,
  );
  await db.query(
    "select public.save_my_reminder_preferences('America/Sao_Paulo',9,false)",
  );
  await db.exec("reset role; set role service_role");
  assert.equal(
    (
      await db.query(
        "select * from public.due_reminder_candidates('2026-10-22T11:59:00Z')",
      )
    ).rows.length,
    0,
  );
  const due = (
    await db.query(
      "select * from public.due_reminder_candidates('2026-10-22T12:00:00Z')",
    )
  ).rows;
  assert.equal(due.length, 1);
  assert.equal(due[0].user_id, a);
  assert.equal(due[0].plant_name, "Jiboia");
  await db.exec("reset role");
  await db.query(
    "update public.gardens set plants=$1::jsonb where user_id=$2",
    [JSON.stringify([{ ...plant, lastWatered: "2026-10-22" }]), a],
  );
  await db.exec("set role service_role");
  assert.equal(
    (
      await db.query(
        "select * from public.due_reminder_candidates('2026-10-22T12:00:00Z')",
      )
    ).rows.length,
    0,
  );
  await db.exec("reset role; set role anon");
  await assert.rejects(
    () => db.query("select * from public.reminder_preferences"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    () => db.query("select * from public.due_reminder_candidates(now())"),
    (e) => e.code === "42501",
  );
  await db.close();
});
