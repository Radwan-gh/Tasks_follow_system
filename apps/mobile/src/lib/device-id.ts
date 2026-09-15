import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "kanban.deviceId";

let cached: Promise<string> | null = null;

/** RFC 4122 v4. Prefers the platform CSPRNG; Hermes may not expose `crypto.randomUUID`. */
function uuidV4(): string {
  const native = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (native) return native();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

/**
 * This install's stable id — what the server keys `PushDevice` on, and what an
 * admin targets to push to an anonymous phone. Generated once and kept in
 * SecureStore, so it survives restarts and OTA updates but not a reinstall or
 * "clear data" (the same lifetime as Firebase's own installation id).
 */
export function getDeviceId(): Promise<string> {
  cached ??= (async () => {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = uuidV4();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
    return created;
  })().catch((error: unknown) => {
    // Let the next call retry instead of caching a rejected promise forever.
    cached = null;
    throw error;
  });
  return cached;
}
