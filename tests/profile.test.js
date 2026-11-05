import { test } from "node:test";
import assert from "node:assert/strict";
import { profileInput, createProfileStore } from "../src/lib/profile.js";
import { pageForHash } from "../src/lib/routes.js";

test("perfil normaliza campos permitidos e descarta privilégios e dados privados", () => {
  assert.deepEqual(
    profileInput({
      handle: "  MINHAS_PLANTAS ",
      display_name: " Meu jardim ",
      bio: " Olá ",
      city_id: "",
      role: "admin",
      email: "nao-publicar@example.invalid",
      user_id: "outro",
    }),
    {
      handle: "minhas_plantas",
      display_name: "Meu jardim",
      bio: "Olá",
      city_id: null,
    },
  );
  for (const input of [
    { handle: "admin", display_name: "Nome" },
    { handle: "x@y", display_name: "Nome" },
    { handle: "meu_jardim", display_name: "X" },
    { handle: "meu_jardim", display_name: "Nome", bio: "x".repeat(501) },
    { handle: "meu_jardim", display_name: "Nome", city_id: "latitude:123" },
  ])
    assert.throws(() => profileInput(input));
});
test("rotas antigas e desconhecidas preservam o jardim; perfil possui endereço próprio", () => {
  assert.equal(pageForHash("#/perfil"), "profile");
  assert.equal(pageForHash("#/explorar"), "catalog");
  assert.equal(pageForHash(""), "garden");
  assert.equal(pageForHash("#/admin"), "garden");
});
test("salvamento impõe proprietário e revisão sem aceitar role/user_id do formulário", async () => {
  const calls = [];
  const row = {
    user_id: "owner",
    handle: "meu_jardim",
    display_name: "Nome",
    bio: "",
    city_id: null,
    updated_at: "current",
  };
  const query = {
    insert(value) {
      calls.push(["insert", value]);
      return this;
    },
    update(value) {
      calls.push(["update", value]);
      return this;
    },
    eq(...v) {
      calls.push(["eq", ...v]);
      return this;
    },
    select() {
      return this;
    },
    single: async () => ({ data: row, error: null }),
  };
  const store = createProfileStore({ from: () => query }, "owner");
  await store.save({ ...row, user_id: "forged", role: "admin" }, null);
  assert.equal(calls[0][1].user_id, "owner");
  assert.ok(!("role" in calls[0][1]));
  calls.length = 0;
  await store.save({ ...row, user_id: "forged" }, row);
  assert.ok(!("user_id" in calls[0][1]));
  assert.ok(!("updated_at" in calls[0][1]));
  assert.ok(
    calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === "owner"),
  );
  assert.ok(
    calls.some(
      (c) => c[0] === "eq" && c[1] === "updated_at" && c[2] === "current",
    ),
  );
});
