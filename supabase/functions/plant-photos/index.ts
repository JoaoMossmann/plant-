import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createPhotoHandler, limitedBody } from "./handler.js";
import { MAX_BYTES } from "./image.js";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);
const bucket = admin.storage.from("plant-photos");

Deno.serve(
  createPhotoHandler({
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    authenticate: async (token: string) => {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    forUser: (token: string) =>
      createClient(url, publicKey, {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    finishReservation: (path: string, uploaded: boolean) =>
      admin.rpc("finish_photo_reservation", { photo_path: path, uploaded }),
    onIssue: (code: string) => console.warn(code),
    storage: {
      upload: (path: string, bytes: Uint8Array) =>
        bucket.upload(path, bytes, {
          contentType: "image/jpeg",
          cacheControl: "0",
          upsert: false,
        }),
      remove: (paths: string[]) => bucket.remove(paths),
      download: async (path: string) => {
        // Caminho já autorizado pelo banco. URL nova evita reutilizar uma cópia antiga da CDN.
        const response = await fetch(
          `${url}/storage/v1/object/authenticated/plant-photos/${path}?verification=${crypto.randomUUID()}`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "Cache-Control": "no-cache",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          return { data: null, error: true };
        }
        const bytes = await limitedBody(response, MAX_BYTES);
        return {
          data: new Blob([bytes], {
            type: (response.headers.get("content-type") || "")
              .split(";")[0]
              .trim()
              .toLowerCase(),
          }),
          error: null,
        };
      },
    },
  }),
);
