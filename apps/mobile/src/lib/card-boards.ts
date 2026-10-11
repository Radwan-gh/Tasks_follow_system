import type { CardBoardsResponse, CardPlacement } from "@app/types";

/*
 * A task can sit on several boards with one shared status
 * (docs/18-multi-board-tasks.md). These are the task screen's answers to
 * "which board am I working in" and "which of its boards may I untick".
 */

/**
 * The board the task screen works in: the one it was opened from while the
 * task is still on it, else the first of its boards the user belongs to, else
 * its home board. Before the task has loaded, whatever it was opened from — so
 * the board request still starts straight away.
 */
export function contextBoardId(
  opened: string | undefined,
  placements: CardPlacement[] | undefined,
  myBoardIds: ReadonlySet<string> | undefined,
): string | undefined {
  if (!placements || placements.length === 0) return opened;
  if (opened && placements.some((p) => p.boardId === opened)) return opened;
  return placements.find((p) => myBoardIds?.has(p.boardId))?.boardId ?? placements[0].boardId;
}

/** The task's column on `boardId`, falling back to its home list. */
export function listOnBoard(card: { listId: string; placements: CardPlacement[] }, boardId: string | undefined): string {
  // `?? []`: an app update can reach phones before the API that sends `placements`.
  return (card.placements ?? []).find((p) => p.boardId === boardId)?.listId ?? card.listId;
}

/** The task as it looks right after a move on `boardId` — the server moves its other boards. */
export function withMove<T extends { boardId: string; listId: string; placements: CardPlacement[] }>(
  card: T,
  boardId: string,
  listId: string,
): T {
  return {
    ...card,
    listId: card.boardId === boardId ? listId : card.listId,
    placements: (card.placements ?? []).map((p) => (p.boardId === boardId ? { ...p, listId } : p)),
  };
}

/** One row of the «لوحات المهمة» sheet. */
export interface BoardRow {
  id: string;
  name: string;
  checked: boolean;
  /** Why the row cannot be toggled, or null when it can. */
  lock: "notMember" | "archived" | "lastOfMine" | null;
}

/**
 * The sheet's rows: the task's boards first (in their order), then the boards
 * it could be added to. Unticking is refused where the server would refuse
 * it — a board the user is not a member of, an archived one — and for the
 * last ticked board of the user's own, since the task has to stay on at least
 * one board they belong to (or on at least one board at all, for an admin).
 */
export function boardRows(data: CardBoardsResponse, selectedIds: string[]): BoardRow[] {
  const selected = new Set(selectedIds);
  const current = new Map(data.boards.map((b) => [b.id, b]));
  // Boards the user may take the task off: theirs (an admin's are all of them), plus any just added.
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
