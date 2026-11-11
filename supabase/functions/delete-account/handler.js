async function confirmationBody(request) {
  if (
    (request.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase() !== "application/json"
  )
    return null;
  if (Number(request.headers.get("content-length")) > 4096 || !request.body)
    return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(4096);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.length > bytes.length) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, size);
      size += value.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export function createDeletionHandler({
  authenticate,
  authorizeAttempt,
  verifyPassword,
  beginDeletion,
  storage,
  deleteUser,
  allowedOrigins,
  onIssue = (_code) => {},
}) {
  return async (request) => {
    const origin = request.headers.get("origin") || "";
    const allowed = origin && allowedOrigins.includes(origin);
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin, Authorization",
    };
    if (allowed)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
    const response = (status, code) =>
      new Response(JSON.stringify(typeof code === "string" ? { code } : code), {
        status,
        headers,
      });
    if (origin && !allowed) return response(403, "origin_forbidden");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return response(405, "method_not_allowed");
    try {
      const match = /^Bearer\s+(\S+)$/i.exec(
        request.headers.get("authorization") || "",
      );
      if (!match) return response(401, "authentication_required");
      const user = await authenticate(match[1]);
      if (!user?.id || !user.email)
        return response(401, "authentication_required");
      const body = await confirmationBody(request);
      if (
        !body ||
        Array.isArray(body) ||
        body.deleteAccount !== true ||
        typeof body.password !== "string" ||
        body.password.length < 1 ||
        body.password.length > 128 ||
        Object.keys(body).some(
          (key) => !["deleteAccount", "password"].includes(key),
        )
      )
        return response(400, "confirmation_required");
      const attempt = await authorizeAttempt(match[1]);
      if (attempt.error)
        return response(
          attempt.error.code === "PT429" ? 429 : 403,
          attempt.error.code === "PT429"
            ? "deletion_rate"
            : "deletion_forbidden",
        );
      if (!(await verifyPassword(user, body.password)))
        return response(403, "password_invalid");
      const begun = await beginDeletion(user.id);
      if (begun.error)
        return response(
          begun.error.code === "PT409" ? 409 : 503,
          begun.error.code === "PT409"
            ? "uploads_pending"
            : "deletion_unavailable",
        );
      let batches = 0;
      async function clearFolder(prefix, depth) {
        if (depth > 10) throw new Error("photo_folder_depth");
        while (true) {
          if (++batches > 100) throw new Error("deletion_batch_limit");
          const result = await storage.list(prefix, { limit: 1000, offset: 0 });
          if (result.error || !Array.isArray(result.data))
            throw new Error("storage_list_failed");
          if (!result.data.length) return;
          const files = [];
          for (const file of result.data) {
            if (
              typeof file.name !== "string" ||
              !file.name.length ||
              [".", ".."].includes(file.name) ||
              /[\\/\x00]/.test(file.name)
            )
              throw new Error("unexpected_photo_layout");
            const path = `${prefix}/${file.name}`;
            if (file.id === null && file.metadata === null)
              await clearFolder(path, depth + 1);
            else files.push(path);
          }
          if (files.length) {
            const removed = await storage.remove(files);
            if (removed.error) throw new Error("storage_remove_failed");
          }
        }
      }
      await clearFolder(user.id, 0);
      const deleted = await deleteUser(user.id);
      if (deleted.error) throw new Error("auth_delete_failed");
      return response(200, { deleted: true });
    } catch {
      onIssue("account_deletion_pending");
      return response(503, "deletion_unavailable");
    }
  };
}
