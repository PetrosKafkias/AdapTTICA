import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    build: {
      target: "es2022",
      sourcemap: true,
    },
    server: {
      port: Number(env.VITE_DEV_PORT || 5173),
      strictPort: true,
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 4173),
      strictPort: true,
    },
  };
});
