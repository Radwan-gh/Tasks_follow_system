import { loadIdSet, saveIdSet } from "./stored-id-set";

/**
 * Which board groups on «مهامي» this user *folded*. Groups start open, so a
 * board that shows up later appears open. Per user, on this device — see
 * `toggleFoldedBoard` in `@app/types` for how the set stays short.
 */
const keyFor = (userId: string) => `kanban.myTasksFolded.${userId}`;

export function loadFoldedBoards(userId: string): Promise<ReadonlySet<string>> {
  return loadIdSet(keyFor(userId));
}

export function saveFoldedBoards(userId: string, folded: ReadonlySet<string>): void {
  saveIdSet(keyFor(userId), folded);
}
