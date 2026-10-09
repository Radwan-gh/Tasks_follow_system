import * as SecureStore from "expo-secure-store";

/**
 * Which category sections on the boards list this user left *open*. Sections
 * start folded, so only the open ones are stored — a category created later
 * shows up folded too. Kept per user on this device in SecureStore (the one
 * key-value store already in the native build, so no APK rebuild); the value is
 * a short JSON array of category ids plus `NONE` for «بلا تصنيف».
 */
const keyFor = (userId: string) => `kanban.openSections.${userId}`;

export async function loadOpenSections(userId: string): Promise<ReadonlySet<string>> {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveOpenSections(userId: string, open: ReadonlySet<string>): void {
  // Best effort: losing a fold preference is not worth surfacing an error for.
  void SecureStore.setItemAsync(keyFor(userId), JSON.stringify([...open])).catch(() => undefined);
}
