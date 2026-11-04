import { useCallback, useEffect, useState } from "react";

/**
 * Which board groups on «مهامي» this user *folded*. Groups start open, so a
 * board that shows up later appears open. Kept per user in this browser's
 * `localStorage` (the same place the boards list remembers its open
 * sections); see `toggleFoldedBoard` in `./my-tasks-folds` for how the set stays
 * short. Best effort both ways: blocked storage just means nothing is
 * remembered.
 */
const keyFor = (userId: string) => `kanban.myTasksFolded.${userId}`;

function read(userId: string | undefined): ReadonlySet<string> {
  if (!userId) return new Set();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyFor(userId)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

export function useFoldedBoards(userId: string | undefined) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => read(userId));

  // Another account signing in on this tab gets its own folds.
  useEffect(() => setFolded(read(userId)), [userId]);

  const save = useCallback(
    (next: ReadonlySet<string>) => {
      setFolded(next);
      if (!userId) return;
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify([...next]));
      } catch {
        // Losing a fold preference is not worth surfacing an error for.
      }
    },
    [userId],
  );

  return [folded, save] as const;
}
