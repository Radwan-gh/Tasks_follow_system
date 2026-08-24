import { ApiError, createApiClient } from "@app/api-client";
import { tokenStore } from "./token-store";

// The client itself lives in `packages/api-client` so the web app and the
// Expo app call the API through one implementation (single-flight refresh,
// 401-retry and all). Only the two browser-specific bits are supplied here.
//
// In local dev, "/api" is proxied to the NestJS server by vite.config.ts.
// In production the web app is served as static files with no proxy, so the
// deployed API's absolute URL must be baked in at build time via this env var.
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export const api = createApiClient({
  baseUrl: API_BASE,
  storage: tokenStore,
  onUnauthorized: () => {
    window.location.href = "/login";
  },
});

export { ApiError };
