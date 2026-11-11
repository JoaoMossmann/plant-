import { test } from "node:test";
import assert from "node:assert/strict";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import {
  MAX_BYTES,
  normalizePhoto,
  PhotoError,
} from "../supabase/functions/plant-photos/image.js";
import { createPhotoHandler } from "../supabase/functions/plant-photos/handler.js";
import { createPhotoStore } from "../src/lib/photos.js";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const path = owner + "/33333333-3333-4333-8333-333333333333.jpg";
const png = PNG.sync.write({
  width: 2,
  height: 2,
  data: Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
  ]),
});

function fixture(overrides = {}) {
  const calls = {
    uploaded: [],
    finished: [],
    removed: [],
    rpc: [],
    downloads: 0,
  };
  const rpc = async (name, args) => {
    calls.rpc.push([name, args]);
    return {
      data:
        name === "reserve_my_photo"
          ? path
          : name === "pending_my_photo_removals"
            ? []
            : null,
      error: null,
    };
  };
  const handler = createPhotoHandler({
    allowedOrigins: ["https://app.example"],
    authenticate: async (token) =>
      token === "valid-test-session" ? { id: owner } : null,
    forUser: () => ({ rpc }),
    storage: {
      upload: async (name, bytes) => {
        calls.uploaded.push([name, bytes]);
        return { error: null };
      },
      download: async () => {
        calls.downloads++;
        return { data: new Blob([png], { type: "image/png" }), error: null };
      },
      remove: async (paths) => {
        calls.removed.push(paths);
        return { error: null };
      },
    },
    finishReservation: async (...args) => {
      calls.finished.push(args);
      return { error: null };
    },
    ...overrides,
  });
  return { handler, calls, rpc };
}
function req(
  body,
  {
    token = "valid-test-session",
    type = "application/json",
    method = "POST",
    origin,
  } = {},
) {
  const headers = { "content-type": type };
  if (token) headers.authorization = "Bearer " + token;
  if (origin) headers.origin = origin;
  return new Request("https://edge.example/plant-photos", {
    method,
    headers,
    body:
      method === "POST"
        ? type === "application/json"
          ? JSON.stringify(body)
          : body
        : undefined,
  });
}

test("servidor decodifica e reencoda PNG/JPEG, remove EXIF e reduz dimensões", () => {
  const converted = normalizePhoto(png, "image/png");
  const decoded = jpeg.decode(converted);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  // A origem transparente é achatada sobre fundo branco.
  assert.ok(
    decoded.data[12] > 150 && decoded.data[13] > 150 && decoded.data[14] > 150,
  );
  const raw = {
    width: 1100,
    height: 1,
    data: Buffer.alloc(1100 * 4, 255),
    exifBuffer: Buffer.from("Exif\0\0GPS-private-test"),
  };
  const original = jpeg.encode(raw, 80).data;
  assert.ok(Buffer.from(original).includes(Buffer.from("GPS-private-test")));
  const encoded = normalizePhoto(original, "image/jpeg");
  assert.equal(jpeg.decode(encoded).width, 1000);
  assert.ok(!Buffer.from(encoded).includes(Buffer.from("GPS-private-test")));
});

test("assinatura falsa, CRC inválido, dados truncados, animação e bomba de dimensões são rejeitados", () => {
  for (const [bytes, mime] of [
    [Buffer.from('<svg onload="alert(1)"></svg>'), "image/png"],
    [png, "image/jpeg"],
    [png.subarray(0, 30), "image/png"],
    [Buffer.concat([png, Buffer.from("<script>bad()</script>")]), "image/png"],
    [png, "image/webp"],
    [new Uint8Array(MAX_BYTES + 1), "image/jpeg"],
  ])
    assert.throws(() => normalizePhoto(bytes, mime), PhotoError);
  const broken = Buffer.from(png);
  broken[29] ^= 1;
  assert.throws(() => normalizePhoto(broken, "image/png"), PhotoError);
  const bomb = Buffer.from(png);
  bomb.writeUInt32BE(65535, 16);
  bomb.writeUInt32BE(65535, 20);
  assert.throws(
    () => normalizePhoto(bomb, "image/png"),
    (e) => e.status === 413,
  );
  const animated = Buffer.concat([
    png.subarray(0, 33),
    Buffer.from([0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]),
    png.subarray(33),
  ]);
  assert.throws(
    () => normalizePhoto(animated, "image/png"),
    (e) => e.code === "animated_image",
  );
});

test("autenticação de servidor é obrigatória; CORS não substitui autenticação", async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (await handler(req({ action: "read", path }, { token: null }))).status,
    401,
  );
  assert.equal(
    (await handler(req({ action: "read", path }, { token: "forged" }))).status,
    401,
  );
  assert.equal(
    (await handler(req({}, { origin: "https://untrusted.example" }))).status,
    403,
  );
  assert.equal(
    (
      await handler(
        req(null, {
          method: "OPTIONS",
          token: null,
          origin: "https://app.example",
        }),
      )
    ).status,
    204,
  );
  assert.equal((await handler(req(null, { method: "GET" }))).status, 405);
  assert.equal(calls.rpc.length, 0);
});

test("upload reserva espaço antes de decodificar e grava somente o novo JPEG", async () => {
  const { handler, calls } = fixture();
  const result = await handler(req(png, { type: "image/png" }));
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { path });
  assert.equal(calls.rpc[0][0], "reserve_my_photo");
  assert.equal(calls.uploaded.length, 1);
  assert.equal(jpeg.decode(calls.uploaded[0][1]).width, 2);
  assert.deepEqual(calls.finished, [[path, true]]);
});

test("quota e limite de frequência impedem upload sem expor erro do banco", async () => {
  for (const [code, status] of [
    ["PT413", 413],
    ["PT429", 429],
    ["42501", 403],
  ]) {
    const { handler, calls } = fixture({
      forUser: () => ({
        rpc: async () => ({
          error: { code, message: "internal-private-detail" },
        }),
      }),
    });
    const response = await handler(req(png, { type: "image/png" }));
    assert.equal(response.status, status);
    assert.ok(!(await response.text()).includes("internal-private-detail"));
    assert.equal(calls.uploaded.length, 0);
    assert.equal(calls.finished.length, 0);
  }
});

test("imagem inválida libera reserva; upload incerto preserva reserva e cota", async () => {
  const valid = fixture();
  assert.equal(
    (
      await valid.handler(
        req(Buffer.from("not a photo"), { type: "image/jpeg" }),
      )
    ).status,
    415,
  );
  assert.deepEqual(valid.calls.finished, [[path, false]]);
  const uncertain = fixture({
    storage: {
      upload: async () => {
        throw new Error("uncertain-network-result");
      },
    },
  });
  assert.equal(
    (await uncertain.handler(req(png, { type: "image/png" }))).status,
    503,
  );
  assert.equal(uncertain.calls.finished.length, 0);
});

test("body sem Content-Length tem limite durante a leitura", async () => {
  const { handler, calls } = fixture();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MAX_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  const request = new Request("https://edge.example/plant-photos", {
    method: "POST",
    headers: {
      authorization: "Bearer valid-test-session",
      "content-type": "image/jpeg",
    },
    body: stream,
    duplex: "half",
  });
  assert.equal((await handler(request)).status, 413);
  assert.equal(calls.uploaded.length, 0);
  assert.deepEqual(calls.finished, [[path, false]]);
});

test("foto alheia é recusada antes do Storage; foto removida não reutiliza cache", async () => {
  const denied = fixture();
  assert.equal(
    (
      await denied.handler(
        req({ action: "read", path: path.replace(owner, other) }),
      )
    ).status,
    403,
  );
  assert.equal(denied.calls.downloads, 0);
  const missing = fixture({
    forUser: () => ({ rpc: async () => ({ error: { code: "PT404" } }) }),
  });
  assert.equal(
    (await missing.handler(req({ action: "read", path }))).status,
    404,
  );
  assert.equal(missing.calls.downloads, 0);
  const allowed = fixture();
  const response = await allowed.handler(
    req({ action: "read", path }, { origin: "https://app.example" }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/octet-stream",
  );
  assert.equal(response.headers.get("x-photo-type"), "image/png");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array(png),
  );
});

test("remoção prepara bloqueio no banco e rejeita fotos em uso e lotes inválidos", async () => {
  const { handler, calls } = fixture();
  assert.equal(
    (await handler(req({ action: "remove", paths: [path] }))).status,
    200,
  );
  assert.equal(calls.rpc[0][0], "prepare_my_photo_removal");
  assert.deepEqual(calls.removed, [[path]]);
  assert.deepEqual(calls.finished, [[path, false]]);
  assert.equal(
    (await handler(req({ action: "remove", paths: Array(51).fill(path) })))
      .status,
    400,
  );
  const inUse = fixture({
    forUser: () => ({ rpc: async () => ({ error: { code: "PT409" } }) }),
  });
  assert.equal(
    (await inUse.handler(req({ action: "remove", paths: [path] }))).status,
    409,
  );
  assert.equal(inUse.calls.removed.length, 0);
});

test("limpeza retenta remoções pendentes e preserva bloqueio quando Storage falha", async () => {
  const { handler, calls } = fixture({
    forUser: () => ({
      rpc: async (name) => ({
        data: name === "pending_my_photo_removals" ? [path] : null,
        error: null,
      }),
    }),
  });
  assert.equal((await handler(req({ action: "cleanup" }))).status, 200);
  assert.deepEqual(calls.removed, [[path]]);
  const failed = fixture({
    storage: { remove: async () => ({ error: true }) },
  });
  assert.equal(
    (await failed.handler(req({ action: "remove", paths: [path] }))).status,
    503,
  );
  assert.equal(failed.calls.rpc[0][0], "prepare_my_photo_removal");
  assert.equal(failed.calls.finished.length, 0);
});

test("cliente do fluxo protegido não acessa Storage diretamente nem faz fallback", async () => {
  const calls = [];
  const client = {
    get storage() {
      throw Error("Direct Storage forbidden");
    },
    functions: {
      invoke: async (_, options) => {
        calls.push(options.body);
        if (options.body instanceof Blob)
          return { data: { path }, error: null };
        if (options.body.action === "read")
          return {
            data: new Blob([png]),
            response: new Response(null, {
              headers: { "x-photo-type": "image/png" },
            }),
            error: null,
          };
        return { data: { removed: 1 }, error: null };
      },
    },
  };
  const store = createPhotoStore(client, owner, true);
  assert.equal(
    await store.upload(new Blob([png], { type: "image/png" })),
    path,
  );
  assert.equal((await store.download(path)).type, "image/png");
  await store.remove([path, path]);
  await store.cleanup();
  assert.deepEqual(calls[2], { action: "remove", paths: [path] });
  client.functions.invoke = async () => ({
    error: {
      context: new Response(JSON.stringify({ code: "photo_quota" }), {
        status: 413,
      }),
    },
  });
  await assert.rejects(
    () => store.upload(new Blob([png], { type: "image/png" })),
    /limite de fotos/,
  );
});
