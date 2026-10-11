import type { CardBoardsResponse } from "@app/types";

/** One row of the «اللوحات» checklist. */
export interface BoardRow {
  id: string;
  name: string;
  checked: boolean;
  /** Why the row cannot be toggled, or null when it can. */
  lock: "notMember" | "archived" | "lastOfMine" | null;
}

/**
 * Mirrors the mobile app's `boardRows` (`apps/mobile/src/lib/card-boards.ts`,
 * unit-tested there) — a local copy because this app imports only types from
 * the shared packages' CommonJS builds, as with `can-supervise.ts`. Keep the
 * two identical.
 *
 * The task's boards first (in their order), then the boards it could be added
 * to. Unticking is refused where the server would refuse it — a board the user
 * is not a member of, an archived one — and for the last ticked board of the
 * user's own, since the task has to stay on at least one board they belong to
 * (on at least one board at all, for an admin).
 */
export function boardRows(data: CardBoardsResponse, selectedIds: string[]): BoardRow[] {
  const selected = new Set(selectedIds);
  const current = new Map(data.boards.map((b) => [b.id, b]));
  const mine = (id: string) => current.get(id)?.canRemove ?? true;
  const ownTicked = selectedIds.filter(mine).length;

  const all = [...data.boards, ...data.options.filter((o) => !current.has(o.id))];
  return all.map((board) => {
    const checked = selected.has(board.id);
    const known = current.get(board.id);
    let lock: BoardRow["lock"] = null;
    if (!data.canChange || (checked && known && !known.canRemove)) {
      lock = known?.isArchived ? "archived" : "notMember";
    } else if (checked && ownTicked <= 1) {
      lock = "lastOfMine";
    }
    return { id: board.id, name: board.name, checked, lock };
  });
}
