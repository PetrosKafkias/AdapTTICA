import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const allEnv = loadEnv(mode, process.cwd(), "");
  const apiPort = Number(allEnv.API_PORT || 8787);

  return {
    build: {
      target: "es2022",
      sourcemap: true,
    },
    server: {
      port: Number(env.VITE_DEV_PORT || 5173),
      strictPort: true,
      // Keep the API on the same origin as the dev server so the vendored
      // frontend bundle's hardcoded `credentials: "same-origin"` fetch
      // calls still carry the session cookie.
      proxy: {
        "/api/v1": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: false,
        },
      },
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
    },
  };
});
