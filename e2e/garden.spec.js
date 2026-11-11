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
  const profiles = new Map();
  const calls = {
    signup: 0,
    recovery: 0,
    resend: 0,
    uploads: 0,
    downloads: 0,
    deletions: 0,
    directStorage: 0,
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
    if (path.endsWith("/resend")) {
      calls.resend++;
      return json({});
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
      calls.directStorage++;
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
    if (path === "/functions/v1/plant-photos") {
      if (req.headers()["content-type"]?.startsWith("image/")) {
        calls.uploads++;
        return json({ path: `${id}/${crypto.randomUUID()}.jpg` }, 201);
      }
      const body = req.postDataJSON();
      if (body.action === "read") {
        calls.downloads++;
        return route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-expose-headers": "x-photo-type",
            "x-photo-type": "image/jpeg",
            "cache-control": "private, no-store",
          },
          contentType: "application/octet-stream",
          body: await readFile("src/assets/plants/maranta.jpg"),
        });
      }
      return json({ removed: body.paths?.length || 0 });
    }
    if (path === "/rest/v1/cities")
      return json([
        { id: "sao-leopoldo-rs", name: "São Leopoldo", state_code: "RS" },
        { id: "novo-hamburgo-rs", name: "Novo Hamburgo", state_code: "RS" },
      ]);
    if (path === "/rest/v1/profiles") {
      if (req.method() === "GET")
        return json(profiles.has(id) ? [profiles.get(id)] : []);
      const body = req.postDataJSON();
      if (
        [...profiles.values()].some(
          (p) => p.user_id !== id && p.handle === body.handle,
        )
      )
        return json({ code: "23505" }, 409);
      const current = profiles.get(id);
      if (
        req.method() === "PATCH" &&
        (!current ||
          url.searchParams.get("updated_at") !== "eq." + current.updated_at)
      )
        return json({ code: "PGRST116" }, 406);
      const row = {
        ...body,
        user_id: id,
        updated_at: new Date().toISOString(),
      };
      profiles.set(id, row);
      return json(row);
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
  return { gardens, profiles, calls };
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
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "primeiro abra o e-mail",
  );
  await expect(page.getByRole("status")).toContainText("a@example.invalid");
  await expect(
    page.getByRole("button", { name: /Reenviar e-mail em/ }),
  ).toBeDisabled();
  expect(calls.signup).toBe(1);
  await page
    .getByRole("button", { name: "Já confirmei meu e-mail · entrar" })
    .click();
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
  expect(calls.directStorage).toBe(0);
});

test("cota de fotos mantém formulário e permite nova tentativa sem duplicar a planta", async ({
  page,
}) => {
  const { gardens } = await mockBackend(page);
  let quota = true;
  await page.route("**/functions/v1/plant-photos", (route) =>
    quota && route.request().headers()["content-type"]?.startsWith("image/")
      ? route.fulfill({
          status: 413,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ code: "photo_quota" }),
        })
      : route.fallback(),
  );
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page
    .getByRole("button", { name: "Adicionar planta", exact: true })
    .click();
  await page.getByLabel("Nome carinhoso").fill("Minha foto");
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
  await expect(page.getByRole("alert")).toContainText("limite de fotos");
  await expect(page.getByLabel("Nome carinhoso")).toHaveValue("Minha foto");
  expect(gardens.has(A)).toBe(false);
  quota = false;
  await page
    .getByRole("button", { name: "Adicionar ao meu jardim", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Minha foto", exact: true }),
  ).toBeVisible();
  expect(gardens.get(A).plants).toHaveLength(1);
});

test("remoção salva o jardim e avisa sobre limpeza pendente sem ressuscitar a planta", async ({
  page,
}) => {
  const { gardens } = await mockBackend(page);
  gardens.set(A, {
    version: 1,
    plants: [
      {
        id: crypto.randomUUID(),
        name: "Foto removível",
        species: "Maranta leuconeura",
        catalogId: "maranta",
        acquired: "2026-01-01",
        interval: 7,
        history: [],
        photoPath: `${A}/${crypto.randomUUID()}.jpg`,
      },
    ],
  });
  let pending = false,
    retried = false;
  await page.route("**/functions/v1/plant-photos", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "remove") {
      pending = true;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ code: "photo_remove_failed" }),
      });
    }
    if (body.action === "cleanup" && pending) retried = true;
    return route.fallback();
  });
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page
    .getByRole("button", { name: "Foto removível", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remover planta", exact: true })
    .click();
  await page.getByRole("button", { name: "Sim, excluir", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Alteração salva");
  expect(gardens.get(A).plants).toHaveLength(0);
  await page
    .getByRole("button", { name: "Atualizar dados", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(retried).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Foto removível", exact: true }),
  ).toHaveCount(0);
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
  expect(calls.deletions).toBe(0);
  await page.getByLabel("Sua senha atual").fill("a-test-password-long");
  await page.getByRole("button", { name: "Excluir permanentemente" }).click();
  await expect(
    page.getByRole("button", { name: "Entrar / criar conta" }),
  ).toBeVisible();
  expect(calls.deletions).toBe(1);
});

test("exclusão recusada mantém sessão e limpa a senha digitada", async ({
  page,
}) => {
  await mockBackend(page);
  await page.route("**/functions/v1/delete-account", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({
          status: 403,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ code: "password_invalid" }),
        }),
  );
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page.getByRole("button", { name: "Minha conta", exact: true }).click();
  await page
    .getByRole("button", { name: "Excluir minha conta e dados" })
    .click();
  await page.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await page.getByLabel("Sua senha atual").fill("wrong-test-password");
  await page.getByRole("button", { name: "Excluir permanentemente" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "senha atual não foi confirmada",
  );
  await expect(page.getByLabel("Sua senha atual")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Minha conta", exact: true }),
  ).toBeVisible();
});

test("confirmação permite reenvio após intervalo, sem entrar automaticamente", async ({
  page,
}) => {
  const { calls } = await mockBackend(page);
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar / criar conta" }).click();
  await page.getByRole("button", { name: "Quero criar uma conta" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill("a@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("a-test-password-long");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await page
    .getByRole("button", {
      name: "Reenviar e-mail de confirmação",
      exact: true,
    })
    .click();
  expect(calls.resend).toBe(1);
  await expect(page.getByRole("status")).toContainText("confirmação pendente");
  await expect(
    page.getByRole("button", { name: "Reenviar e-mail em 60s" }),
  ).toBeDisabled();
  await expect(page.getByText("Jardim da sua conta")).toHaveCount(0);
});

test("exploração começa em pequenos espaços e permite consultar todos os portes", async ({
  page,
}) => {
  await mockBackend(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar plantas", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Espaço disponível" }),
  ).toHaveValue("compacto");
  await expect(
    page.getByRole("heading", { name: "Ficus-lira", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Espaço disponível" })
    .selectOption("todos");
  await expect(
    page.getByRole("heading", { name: "Ficus-lira", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Espaço disponível" })
    .selectOption("compacto");
  await page
    .getByRole("textbox", { name: "Buscar espécie", exact: true })
    .fill("alecrim");
  await expect(
    page.getByRole("heading", { name: "Alecrim", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".catalog-grid img")).toHaveAttribute(
    "alt",
    /Alecrim/,
  );
});

test("perfil cria, edita e persiste sem compartilhar dados do jardim", async ({
  page,
}) => {
  const { profiles } = await mockBackend(page);
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(page).toHaveURL(/#\/perfil$/);
  await page
    .getByLabel("Nome de exibição", { exact: true })
    .fill("Meu cantinho");
  await page.getByLabel("Identificador", { exact: true }).fill("meu_cantinho");
  await page
    .getByLabel("Apresentação", { exact: true })
    .fill("Gosto de marantas.");
  await page
    .getByRole("combobox", { name: "Cidade (opcional)", exact: true })
    .selectOption("sao-leopoldo-rs");
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Perfil salvo");
  expect(profiles.get(A).city_id).toBe("sao-leopoldo-rs");
  expect(profiles.get(A).email).toBeUndefined();
  expect(profiles.get(A).role).toBeUndefined();
  await page.reload();
  await expect(page.getByLabel("Nome de exibição")).toHaveValue("Meu cantinho");
  await page
    .getByRole("combobox", { name: "Cidade (opcional)", exact: true })
    .selectOption("");
  await page.getByLabel("Nome de exibição").fill("Meu novo cantinho");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("status")).toContainText("Perfil salvo");
  expect(profiles.get(A).city_id).toBeNull();
  await page
    .getByRole("button", { name: "Minhas plantas", exact: true })
    .click();
  await page.goBack();
  await expect(page.getByLabel("Nome de exibição")).toHaveValue(
    "Meu novo cantinho",
  );
});
test("perfil exige login e não reutiliza perfil de outra conta", async ({
  page,
}) => {
  const { profiles } = await mockBackend(page);
  profiles.set(A, {
    user_id: A,
    handle: "conta_a",
    display_name: "Perfil A",
    bio: "",
    city_id: null,
    updated_at: "2026-01-01",
  });
  await page.goto("/#/perfil");
  await expect(
    page.getByRole("heading", { name: "Seu perfil começa com uma conta." }),
  ).toBeVisible();
  await page.goto("/");
  await signIn(page, "b@example.invalid");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(page.getByLabel("Nome de exibição")).toHaveValue("");
  await expect(page.getByText("Perfil A", { exact: true })).toHaveCount(0);
});
test("perfil mantém edição quando identificador já está ocupado", async ({
  page,
}) => {
  const { profiles } = await mockBackend(page);
  profiles.set(B, {
    user_id: B,
    handle: "ocupado",
    display_name: "Outro perfil",
    updated_at: "2026-01-01",
  });
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await page.getByLabel("Nome de exibição").fill("Meu perfil");
  await page.getByLabel("Identificador", { exact: true }).fill("ocupado");
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "identificador já está em uso",
  );
  await expect(page.getByLabel("Nome de exibição")).toHaveValue("Meu perfil");
  expect(profiles.has(A)).toBe(false);
});

test("perfil indisponível não mostra erro interno e permite tentar novamente", async ({
  page,
}) => {
  await mockBackend(page);
  let unavailable = true;
  await page.route(/\/rest\/v1\/profiles(?:\?|$)/, (route) =>
    unavailable
      ? route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            code: "PGRST205",
            message: "detalhe-interno-nao-exibir",
          }),
        })
      : route.fallback(),
  );
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("indisponível");
  await expect(page.getByText("detalhe-interno-nao-exibir")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Criar perfil", exact: true }),
  ).toHaveCount(0);
  unavailable = false;
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(page.getByLabel("Nome de exibição")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("edição concorrente de perfil não apaga alteração feita em outro aparelho", async ({
  page,
}) => {
  const { profiles } = await mockBackend(page);
  profiles.set(A, {
    user_id: A,
    handle: "conta_a",
    display_name: "Original",
    bio: "",
    city_id: null,
    updated_at: "2026-01-01T00:00:00Z",
  });
  await page.goto("/");
  await signIn(page, "a@example.invalid");
  await page.getByRole("button", { name: "Meu perfil", exact: true }).click();
  await expect(page.getByLabel("Nome de exibição")).toHaveValue("Original");
  profiles.set(A, {
    ...profiles.get(A),
    display_name: "Alterado em outro aparelho",
    updated_at: "2026-01-02T00:00:00Z",
  });
  await page.getByLabel("Nome de exibição").fill("Edição ainda não salva");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Recarregue os dados");
  expect(profiles.get(A).display_name).toBe("Alterado em outro aparelho");
  await expect(page.getByLabel("Nome de exibição")).toHaveValue(
    "Edição ainda não salva",
  );
  await page.getByRole("button", { name: "Recarregar dados salvos" }).click();
  await expect(page.getByLabel("Nome de exibição")).toHaveValue(
    "Alterado em outro aparelho",
  );
});
