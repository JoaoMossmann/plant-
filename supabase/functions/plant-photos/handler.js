import { MAX_BYTES, normalizePhoto, PhotoError } from "./image.js";

export async function limitedBody(request, limit) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new PhotoError(413, "request_size");
  if (!request.body) throw new PhotoError(400, "empty_request");
  const reader = request.body.getReader();
  // Buffer limitado evita reter milhões de objetos se o corpo vier em chunks mínimos.
  const bytes = new Uint8Array(limit);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > limit) {
        await reader.cancel();
        throw new PhotoError(413, "request_size");
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return bytes.subarray(0, size);
}

function databaseError(error) {
  if (!error) return;
  const known = {
    PT413: [413, "photo_quota"],
    PT429: [429, "photo_rate"],
    PT404: [404, "photo_missing"],
    PT409: [409, "photo_in_use"],
    42501: [403, "photo_forbidden"],
  };
  const [status, code] = known[error.code] || [503, "photo_unavailable"];
  throw new PhotoError(status, code);
}

export function ownedPhoto(owner, path) {
  return (
    typeof path === "string" &&
    /^[0-9a-f-]{36}$/.test(owner) &&
    new RegExp("^" + owner + "/[0-9a-f-]{36}\\.(jpg|png|webp)$").test(path)
  );
}

export function createPhotoHandler({
  authenticate,
  forUser,
  storage,
  finishReservation,
  allowedOrigins,
  onIssue = (_code) => {},
}) {
  return async (request) => {
    const origin = request.headers.get("origin") || "";
    const permitted = origin && allowedOrigins.includes(origin);
    const headers = {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Surrogate-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin, Authorization",
    };
    if (permitted)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Expose-Headers": "x-photo-type",
      });
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    if (origin && !permitted) return json(403, { code: "origin_forbidden" });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return json(405, { code: "method_not_allowed" });
    let reserved = null,
      uploadStarted = false;
    try {
      const match = /^Bearer\s+(\S+)$/i.exec(
        request.headers.get("authorization") || "",
      );
      if (!match) throw new PhotoError(401, "authentication_required");
      const user = await authenticate(match[1]);
      if (!user) throw new PhotoError(401, "authentication_required");
      const client = forUser(match[1]);
      const mime = (request.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (["image/jpeg", "image/png"].includes(mime)) {
        const reservation = await client.rpc("reserve_my_photo");
        databaseError(reservation.error);
        reserved = reservation.data;
        if (!ownedPhoto(user.id, reserved) || !reserved.endsWith(".jpg"))
          throw new PhotoError(503, "photo_unavailable");
        const bytes = await limitedBody(request, MAX_BYTES);
        const normalized = normalizePhoto(bytes, mime);
        uploadStarted = true;
        const { error } = await storage.upload(reserved, normalized);
        if (error) throw new PhotoError(503, "photo_upload_failed");
        // Uma falha aqui preserva a reserva; arquivo e reserva não são contados duas vezes.
        try {
          const finished = await finishReservation(reserved, true);
          if (finished?.error) onIssue("photo_reservation_pending");
        } catch {
          onIssue("photo_reservation_pending");
        }
        return json(201, { path: reserved });
      }
      if (mime !== "application/json")
        throw new PhotoError(415, "unsupported_image");
      let body;
      try {
        body = JSON.parse(
          new TextDecoder().decode(await limitedBody(request, 16 * 1024)),
        );
      } catch (error) {
        if (error instanceof PhotoError) throw error;
        throw new PhotoError(400, "invalid_request");
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new PhotoError(400, "invalid_request");
      if (body.action === "read") {
        if (!ownedPhoto(user.id, body.path))
          throw new PhotoError(403, "photo_forbidden");
        const allowed = await client.rpc("authorize_my_photo", {
          photo_path: body.path,
        });
        databaseError(allowed.error);
        const { data, error } = await storage.download(body.path);
        if (
          error ||
          !data ||
          data.size > MAX_BYTES ||
          !["image/jpeg", "image/png", "image/webp"].includes(data.type)
        )
          throw new PhotoError(503, "photo_download_failed");
        return new Response(data, {
          headers: {
            ...headers,
            "Content-Type": "application/octet-stream",
            "X-Photo-Type": data.type,
          },
        });
      }
      if (body.action === "cleanup") {
        const pending = await client.rpc("pending_my_photo_removals");
        databaseError(pending.error);
        if (!Array.isArray(pending.data))
          throw new PhotoError(503, "photo_unavailable");
        if (!pending.data.length) return json(200, { removed: 0 });
        body = { action: "remove", paths: pending.data };
      }
      if (body.action === "remove") {
        if (
          !Array.isArray(body.paths) ||
          !body.paths.length ||
          body.paths.length > 50 ||
          !body.paths.every((path) => ownedPhoto(user.id, path))
        )
          throw new PhotoError(400, "invalid_photo_batch");
        const paths = [...new Set(body.paths)];
        const prepared = await client.rpc("prepare_my_photo_removal", {
          photo_paths: paths,
        });
        databaseError(prepared.error);
        const { error } = await storage.remove(paths);
        if (error) throw new PhotoError(503, "photo_remove_failed");
        for (const path of paths) {
          try {
            const finished = await finishReservation(path, false);
            if (finished?.error) onIssue("photo_reservation_pending");
          } catch {
            onIssue("photo_reservation_pending");
          }
        }
        return json(200, { removed: paths.length });
      }
      throw new PhotoError(400, "invalid_action");
    } catch (error) {
      if (reserved && !uploadStarted) {
        try {
          const released = await finishReservation(reserved, false);
          if (released?.error) onIssue("photo_reservation_pending");
        } catch {
          onIssue("photo_reservation_pending");
        }
      }
      if (error instanceof PhotoError)
        return json(error.status, { code: error.code });
      onIssue("photo_request_failed");
      return json(503, { code: "photo_unavailable" });
    }
  };
}
