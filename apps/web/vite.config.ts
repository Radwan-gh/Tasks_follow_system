import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Identifies one build so the running app can tell it's stale (see
// src/lib/use-app-update.ts). Prefer the deploy commit SHA when available so
// the id is stable across a re-run of the same build; fall back to a
// timestamp for local builds.
const buildId = process.env.GIT_SHA ?? String(Date.now());

// `version.json` is emitted fresh into every build's dist/ output, served
// alongside the app, and polled at runtime — it must never be cached, so it
// deliberately isn't imported from src (Vite would fingerprint it).
function versionFilePlugin(): Plugin {
  return {
    name: "version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFilePlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
