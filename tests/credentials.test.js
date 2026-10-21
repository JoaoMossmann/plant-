import { test } from "node:test";
import assert from "node:assert/strict";
import { findCredentialPatterns } from "../scripts/credential-patterns.mjs";

test("auditoria distingue chave pública e referências de servidor de segredos reais", () => {
  assert.deepEqual(
    findCredentialPatterns("sb_publishable_" + "x".repeat(40)),
    [],
  );
  assert.deepEqual(
    findCredentialPatterns('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'),
    [],
  );
  const secret = "sb_" + "secret_" + "x".repeat(40);
  assert.deepEqual(findCredentialPatterns(secret), ["supabase-secret-key"]);
  assert.ok(!JSON.stringify(findCredentialPatterns(secret)).includes(secret));
});
test("auditoria detecta JWT administrativo, chave privada e senha SMTP sem retornar valores", () => {
  const jwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
    "signature",
  ].join(".");
  assert.ok(findCredentialPatterns(jwt).includes("supabase-service-role-jwt"));
  assert.ok(
    findCredentialPatterns("-----BEGIN " + "PRIVATE KEY-----").includes(
      "private-key",
    ),
  );
  assert.ok(
    findCredentialPatterns(
      [
        "smtp",
        ":",
        "//",
        "example-user",
        ":",
        "example-pass",
        "@",
        "mail.example.invalid",
      ].join(""),
    ).includes("mail-or-database-password-url"),
  );
});
