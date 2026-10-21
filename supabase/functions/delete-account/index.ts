// Executada somente no servidor Supabase. Credenciais são injetadas pelo provedor.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const permitted = Boolean(origin && allowed.includes(origin));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  if (permitted) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] =
      "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  const response = (status: number, body: object) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !permitted)
    return response(403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return response(405, { error: "Method not allowed" });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return response(401, { error: "Authentication required" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey)
    return response(503, { error: "Service unavailable" });
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user)
    return response(401, { error: "Authentication required" });
  let confirmation;
  try {
    confirmation = await req.json();
  } catch {
    return response(400, { error: "Confirmation required" });
  }
  if (confirmation?.deleteAccount !== true)
    return response(400, { error: "Confirmation required" });
  try {
    const storage = admin.storage.from("plant-photos");
    // Inclui objetos órfãos da conta. Nunca aceite ID ou caminho fornecido pelo cliente.
    for (let batch = 0; ; batch++) {
      if (batch >= 50) throw new Error("Deletion batch limit; retry");
      const { data: files, error: listError } = await storage.list(
        data.user.id,
        { limit: 1000, offset: 0 },
      );
      if (listError) throw listError;
      if (!files?.length) break;
      const { error: removeError } = await storage.remove(
        files.map((file) => `${data.user.id}/${file.name}`),
      );
      if (removeError) throw removeError;
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(
      data.user.id,
    );
    if (deleteError) throw deleteError;
    // gardens é removido por ON DELETE CASCADE. Backups pessoais continuam no dispositivo.
    return response(200, { deleted: true });
  } catch {
    return response(503, { error: "Deletion could not finish. Please retry." });
  }
});
