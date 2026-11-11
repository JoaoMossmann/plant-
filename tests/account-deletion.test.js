import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeletionHandler } from "../supabase/functions/delete-account/handler.js";

const owner = "11111111-1111-4111-8111-111111111111";
function setup(overrides = {}) {
  const calls = [];
  let listed = false;
  const handler = createDeletionHandler({
    allowedOrigins: ["https://app.example"],
    authenticate: async (token) =>
      token === "valid-test-session"
        ? { id: owner, email: "test@example.invalid" }
        : null,
    authorizeAttempt: async () => {
      calls.push("attempt");
      return { error: null };
    },
    verifyPassword: async (user, password) => {
      calls.push("password");
      return user.id === owner && password === "correct-test-password";
    },
    beginDeletion: async (id) => {
      calls.push(["begin", id]);
      return { error: null };
    },
    storage: {
      list: async (prefix) => {
        calls.push(["list", prefix]);
        if (listed) return { data: [], error: null };
        listed = true;
        return { data: [{ id: "file", name: "photo.jpg" }], error: null };
      },
      remove: async (paths) => {
        calls.push(["remove", paths]);
        return { error: null };
      },
    },
    deleteUser: async (id) => {
      calls.push(["delete", id]);
      return { error: null };
    },
    ...overrides,
  });
  return { handler, calls };
}
function req(
  body = { deleteAccount: true, password: "correct-test-password" },
  token = "valid-test-session",
  extra = {},
) {
  return new Request("https://function.example/delete-account", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
test("exclusão exige sessão, confirmação e senha, sem aceitar outro proprietário", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(req(undefined, null))).status, 401);
  assert.equal((await handler(req(undefined, "forged"))).status, 401);
  for (const body of [
    { deleteAccount: true },
    { deleteAccount: false, password: "correct-test-password" },
    {
      deleteAccount: true,
      password: "correct-test-password",
      user_id: "other",
    },
    { deleteAccount: true, password: "x".repeat(129) },
  ])
    assert.equal((await handler(req(body))).status, 400);
  assert.equal(
    (
      await handler(
        req(undefined, undefined, { origin: "https://wrong.example" }),
      )
    ).status,
    403,
  );
  assert.deepEqual(calls, []);
});
test("senha incorreta consome tentativa e não inicia remoção", async () => {
  const { handler, calls } = setup();
  const result = await handler(
    req({ deleteAccount: true, password: "wrong-password" }),
  );
  assert.equal(result.status, 403);
  assert.deepEqual(await result.json(), { code: "password_invalid" });
  assert.deepEqual(calls, ["attempt", "password"]);
});
test("limites e uploads pendentes impedem a etapa destrutiva", async () => {
  const limited = setup({
    authorizeAttempt: async () => ({ error: { code: "PT429" } }),
  });
  assert.equal((await limited.handler(req())).status, 429);
  assert.deepEqual(limited.calls, []);
  const pending = setup({
    beginDeletion: async () => ({ error: { code: "PT409" } }),
  });
  assert.equal((await pending.handler(req())).status, 409);
  assert.deepEqual(pending.calls, ["attempt", "password"]);
});
test("bloqueio precede Storage e só o proprietário verificado é removido", async () => {
  const { handler, calls } = setup();
  const result = await handler(req());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { deleted: true });
  assert.deepEqual(calls, [
    "attempt",
    "password",
    ["begin", owner],
    ["list", owner],
    ["remove", [owner + "/photo.jpg"]],
    ["list", owner],
    ["delete", owner],
  ]);
  assert.match(result.headers.get("cache-control"), /no-store/);
});
test("erro de Storage preserva conta para retentar e não expõe detalhes internos", async () => {
  const { handler, calls } = setup({
    storage: {
      list: async () => ({ error: { message: "private-internal-error" } }),
    },
  });
  const result = await handler(req());
  assert.equal(result.status, 503);
  assert.ok(!(await result.text()).includes("private-internal-error"));
  assert.ok(!calls.some((c) => Array.isArray(c) && c[0] === "delete"));
});
test("arquivos legados em subpastas são removidos sem sair da pasta do proprietário", async () => {
  const removed = [];
  const finished = new Set();
  const { handler } = setup({
    storage: {
      list: async (prefix) => ({
        error: null,
        data: finished.has(prefix)
          ? []
          : prefix === owner
            ? [{ id: null, metadata: null, name: "legacy" }]
            : [{ id: "file", name: "old photo.png" }],
      }),
      remove: async (paths) => {
        removed.push(...paths);
        finished.add(owner + "/legacy");
        finished.add(owner);
        return { error: null };
      },
    },
  });
  assert.equal((await handler(req())).status, 200);
  assert.deepEqual(removed, [owner + "/legacy/old photo.png"]);
  const traversal = setup({
    storage: {
      list: async () => ({
        data: [{ id: "file", name: "../other" }],
        error: null,
      }),
    },
  });
  assert.equal((await traversal.handler(req())).status, 503);
});
test("corpos grandes são recusados antes de conferir senha e remover dados", async () => {
  const { handler, calls } = setup();
  assert.equal(
    (
      await handler(
        req({ deleteAccount: true, password: "x", padding: "a".repeat(5000) }),
      )
    ).status,
    400,
  );
  assert.deepEqual(calls, []);
});
