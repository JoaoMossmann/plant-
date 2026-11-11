import { createClient } from "@supabase/supabase-js";
import { publicCloudConfig } from "./public-config";

const config = publicCloudConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const cloudConfigured = Boolean(config);
// Ativação coordenada com publicação da função e migração do banco.
export const serverPhotosEnabled =
  import.meta.env.VITE_SERVER_PHOTOS_ENABLED === "true";
export const supabase = config
  ? createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;
export function authRedirect() {
  return `${window.location.origin}${window.location.pathname}`;
}
