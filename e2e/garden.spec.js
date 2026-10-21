import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function jwt(id) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
}
function user(id) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: id === A ? "a@example.invalid" : "b@example.invalid",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}
// Serviço simulado somente para exercitar a interface. RLS é verificado separadamente no PostgreSQL.
async function mockBackend(page) {
  const gardens = new Map();
  const calls = {
    signup: 0,
    recovery: 0,
    uploads: 0,
    downloads: 0,
    deletions: 0,
  };
  await page.route("https://garden-e2e.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (req.method() === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
      });
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    if (path.endsWith("/token")) {
      const body = req.postDataJSON();
      const id = body.email === "b@example.invalid" ? B : A;
      return json({
        access_token: jwt(id),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh",
        user: user(id),
      });
    }
    if (path.endsWith("/signup")) {
      calls.signup++;
      return json({ user: user(A), session: null });
    }
    if (path.endsWith("/recover")) {
      calls.recovery++;
      return json({});
    }
    if (path.endsWith("/logout")) return json({});
    if (path.endsWith("/user")) return json(user(A));
    const auth = req.headers().authorization || "";
    let id = A;
    try {
      id = JSON.parse(
        Buffer.from(auth.split(".")[1], "base64url").toString(),
      ).sub;
    } catch {}
    if (path.startsWith("/storage/v1/object/")) {
      if (req.method() === "POST") {
        calls.uploads++;
        return json({ Key: path.split("/object/")[1] });
      }
      if (req.method() === "GET") {
        calls.downloads++;
        return route.fulfill({
          status: 200,
          contentType: "image/jpeg",
          body: await readFile("src/assets/plants/maranta.jpg"),
        });
      }
      if (req.method() === "DELETE") return json([]);
    }
    if (path === "/functions/v1/delete-account") {
      calls.deletions++;
      gardens.delete(id);
      return json({ deleted: true });
    }
    if (path === "/rest/v1/gardens")
      return json(gardens.has(id) ? [gardens.get(id)] : []);
    if (path.endsWith("/rpc/save_my_garden")) {
      const body = req.postDataJSON();
      const current = gardens.get(id);
      if (body.expected_version !== (current?.version || 0))
        return json({ code: "40001", message: "Conflict" }, 409);
      const version = (current?.version || 0) + 1;
      gardens.set(id, { version, plants: body.new_plants });
      return json(version);
    }
    return json({ error: "Unmocked endpoint" }, 500);
  });
  return { gardens, calls };
}
async function signIn(page, email) {
  await page.getByRole("button", { name: "Entrar / criar conta" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("a-test-password-long");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Jardim da sua conta")).toBeVisible();
}
async function addPlant(page, name) {
  await page
    .getByRole("button", { name: "Adicionar planta", exact: true })
    .click();
  await page.getByLabel("Nome carinhoso").fill(name);
  await page
    .getByRole("combobox", { name: "Espécie do catálogo", exact: true })
    .selectOption("maranta");
  await page
    .getByRole("button", { name: "Adicionar ao meu jardim", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

test("jardim local: criação, persistência, foto, rega e backup", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/");
  await addPlant(page, "Maranta local");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Maranta local" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reguei", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Regada", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar backup" }).click();
  expect((await download).suggestedFilename()).toMatch(/meu-jardim.*json/);
  await page
    .getByRole("button", { name: "Maranta local", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Diário de cuidados" }),
  ).toBeVisible();
  await expect(page.getByText("Rega", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar planta" }).click();
  await page
    .locator(".photo-upload input")
    .setInputFiles("src/assets/plants/maranta.jpg");
  await expect(page.locator(".photo-upload img")).toBeVisible();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator(".plant-card .plant-image img")).toBeVisible();
});
test("contas: dados locais separados, sincronização e troca de usuário", async ({
  page,
}) => {
  const { gardens } = await mockBackend(page);
  await page.goto("/");
  await addPlant(page, "Só local");
  await signIn(page, "a@example.invalid");
  await expect(page.getByRole("heading", { name: "Só local" })).toHaveCount(0);
  await addPlant(page, "Conta A");
  expect(gardens.get(A).plants[0].name).toBe("Conta A");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Conta A" })).toBeVisible();
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
  await page
    .getByRole("button", { name: "Sair da conta", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Só local" })).toBeVisible();
  await signIn(page, "b@example.invalid");
  await expect(page.getByRole("heading", { name: "Conta A" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Só local" })).toHaveCount(0);
});
test("conta: conflito entre aparelhos não sobrescreve dados remotos", async ({
  page,
}) => {
  const { gardens } = await mockBackend(page);
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await addPlant(page, "Versão inicial");
  const row = gardens.get(A);
  gardens.set(A, {
    ...row,
    version: row.version + 1,
    plants: row.plants.map((p) => ({
      ...p,
      name: "Alteração em outro aparelho",
    })),
  });
  await page.getByRole("button", { name: "Reguei", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("outro aparelho");
  expect(gardens.get(A).plants[0].name).toBe("Alteração em outro aparelho");
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Atualizar dados" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alteração em outro aparelho" }),
  ).toBeVisible();
});
test("cadastro e recuperação: confirmação e mensagens sem enumerar contas", async ({
  page,
}) => {
  const { calls } = await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar / criar conta" }).click();
  await page.getByRole("button", { name: "Quero criar uma conta" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("a@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("a-test-password-long");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("instruções por e-mail");
  expect(calls.signup).toBe(1);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("a@example.invalid");
  await page
    .getByRole("button", { name: "Enviar link de recuperação" })
    .click();
  await expect(page.getByRole("status")).toContainText("Se houver uma conta");
  expect(calls.recovery).toBe(1);
});
test("catálogo e ambiente: filtro para pets, ausência de luz e layout móvel", async ({
  page,
}) => {
  await mockBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar plantas", exact: true })
    .click();
  await page.getByLabel("Opções não tóxicas").check();
  await expect(page.getByText("Tóxica a pets", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Meu ambiente", exact: true }).click();
  await page.getByLabel("Como é a luz").selectOption("nenhuma");
  await page.getByRole("button", { name: "Encontrar minhas plantas" }).click();
  await expect(
    page.getByRole("heading", { name: "Aqui precisamos de mais luz." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("conta: foto usa caminho privado e recarrega por download autenticado", async ({
  page,
}) => {
  const { gardens, calls } = await mockBackend(page);
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page
    .getByRole("button", { name: "Adicionar planta", exact: true })
    .click();
  await page.getByLabel("Nome carinhoso").fill("Foto privada");
  await page
    .getByRole("combobox", { name: "Espécie do catálogo", exact: true })
    .selectOption("maranta");
  await page
    .locator(".photo-upload input")
    .setInputFiles("src/assets/plants/maranta.jpg");
  await expect(page.locator(".photo-upload img")).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar ao meu jardim", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Foto privada", exact: true }),
  ).toBeVisible();
  expect(calls.uploads).toBe(1);
  expect(gardens.get(A).plants[0].photoPath).toMatch(new RegExp("^" + A + "/"));
  expect(gardens.get(A).plants[0].photo).toBeUndefined();
  await page.reload();
  await expect(page.locator(".plant-card .plant-image img")).toBeVisible();
  expect(calls.downloads).toBe(1);
});
test("exclusão de conta exige confirmação antes de chamar o servidor", async ({
  page,
}) => {
  const { calls } = await mockBackend(page);
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir minha conta e dados" })
    .click();
  await page.getByRole("button", { name: "Excluir permanentemente" }).click();
  expect(calls.deletions).toBe(0);
  await page.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await page.getByRole("button", { name: "Excluir permanentemente" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar / criar conta" }),
  ).toBeVisible();
  expect(calls.deletions).toBe(1);
});
