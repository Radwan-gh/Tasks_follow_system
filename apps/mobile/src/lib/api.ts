import { createApiClient } from "@app/api-client";
import { tokenStorage } from "./token-storage";

/**
 * The API origin. Unlike the web app there is no dev proxy to hide behind —
 * a phone on the same Wi-Fi cannot reach the laptop's `localhost`, so this has
 * to be a real address (e.g. `http://192.168.1.10:3000`) in `.env`.
 *
 * `EXPO_PUBLIC_*` variables are inlined at bundle time, so this is a build-time
 * constant, not a secret store.
 */
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Set by the root layout once navigation exists. The client is created at
 * module scope (before any component mounts), so it cannot capture the router
 * directly — it calls through this hook instead.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export const api = createApiClient({
  baseUrl: API_BASE,
  storage: tokenStorage,
  onUnauthorized: () => unauthorizedHandler?.(),
});
