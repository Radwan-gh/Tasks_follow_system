import * as SecureStore from "expo-secure-store";

/**
 * A short set of ids kept on this device in SecureStore (the one key-value
 * store already in the native build, so no APK rebuild), stored as a JSON
 * array. Used for per-user fold preferences: the boards list's category
 * sections and «مهامي»'s board groups. An unreadable value loads as empty.
 */
export async function loadIdSet(key: string): Promise<ReadonlySet<string>> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveIdSet(key: string, ids: ReadonlySet<string>): void {
  // Best effort: losing a fold preference is not worth surfacing an error for.
  void SecureStore.setItemAsync(key, JSON.stringify([...ids])).catch(() => undefined);
}
