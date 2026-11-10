import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { PNG } from "pngjs";
import { normalizePhoto } from "./image.js";
import { createPhotoHandler } from "./handler.js";

Deno.test("Deno: codecs Node compatíveis sem extensões nativas", () => {
  const png = PNG.sync.write({
    width: 1,
    height: 1,
    data: Buffer.from([20, 140, 60, 255]),
  });
  const jpg = normalizePhoto(png, "image/png");
  assert.equal(jpg[0], 255);
  assert.equal(jpg[1], 216);
  assert.ok(jpg.length < 2048);
});

Deno.test(
  "Deno: nenhuma credencial administrativa substitui a sessão do usuário",
  async () => {
    const handler = createPhotoHandler({
      authenticate: async () => null,
      forUser: () => {
        throw new Error("Not reached");
      },
      storage: {},
      finishReservation: async () => {},
      allowedOrigins: [],
    });
    const result = await handler(
      new Request("https://example.invalid", {
        method: "POST",
        headers: {
          authorization: "Bearer forged",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "read", path: "forged" }),
      }),
    );
    assert.equal(result.status, 401);
  },
);
