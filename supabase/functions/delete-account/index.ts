import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { createDeletionHandler } from "./handler.js";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, serviceKey, options);

Deno.serve(
  createDeletionHandler({
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    authenticate: async (token: string) => {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    authorizeAttempt: (token: string) =>
      createClient(url, publicKey, {
        ...options,
        global: { headers: { Authorization: `Bearer ${token}` } },
      }).rpc("authorize_my_account_deletion"),
    verifyPassword: async (
      user: { id: string; email: string },
      password: string,
    ) => {
      const client = createClient(url, publicKey, options);
      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: user.email,
          password,
        });
        return !error && data.user?.id === user.id;
      } finally {
        await client.auth.signOut({ scope: "local" });
      }
    },
    beginDeletion: (id: string) =>
      admin.rpc("begin_account_deletion", { target_user: id }),
    storage: admin.storage.from("plant-photos"),
    deleteUser: (id: string) => admin.auth.admin.deleteUser(id),
    onIssue: (code: string) => console.warn(code),
  }),
);
