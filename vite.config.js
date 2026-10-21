import { defineConfig, loadEnv } from "vite";
import { publicCloudConfig } from "./src/lib/public-config.js";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Interrompe antes de gerar artefatos se uma credencial administrativa for configurada por engano.
  publicCloudConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return {
    base: "./",
    build: {
      rollupOptions: {
        output: { manualChunks: { supabase: ["@supabase/supabase-js"] } },
      },
    },
  };
});
