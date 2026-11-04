import { loadIdSet, saveIdSet } from "./stored-id-set";

/**
 * Which category sections on the boards list this user left *open*. Sections
 * start folded, so only the open ones are stored — a category created later
 * shows up folded too. Kept per user on this device in SecureStore (the one
 * key-value store already in the native build, so no APK rebuild); the value is
 * a short JSON array of category ids plus `NONE` for «بلا تصنيف».
 */
const keyFor = (userId: string) => `kanban.openSections.${userId}`;

export function loadOpenSections(userId: string): Promise<ReadonlySet<string>> {
  return loadIdSet(keyFor(userId));
}

export function saveOpenSections(userId: string, open: ReadonlySet<string>): void {
  // Best effort: losing a fold preference is not worth surfacing an error for.
  saveIdSet(keyFor(userId), open);
}
