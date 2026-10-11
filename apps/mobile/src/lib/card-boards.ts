import type { CardBoardsResponse, CardPlacement } from "@app/types";

/*
 * A task can sit on several boards with one shared status
 * (docs/18-multi-board-tasks.md). These are the task screen's answers to
 * "which board am I working in", "which of its boards may I take off" and
 * "which boards does the add-board popup offer".
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

/** How many of the user's latest-used boards the add-board popup offers before anything is typed. */
export const RECENT_BOARDS = 3;
/** How many matches the popup lists while searching. */
const MATCH_LIMIT = 8;

/** A board on the task, as a box in the «اللوحات» field. */
export interface BoardChip {
  id: string;
  name: string;
  /** Whether the box offers ✕. */
  removable: boolean;
}

/**
 * The «اللوحات» boxes, in the order picked. A box can be taken off where the
 * server would allow it: not a board the user is not a member of, nor an
 * archived one (`canRemove`), and not the last of the user's own boards on the
 * task — it has to stay on at least one board they belong to (on at least one
 * board at all, for an admin). A board just added from the popup is the
 * user's own. `names` covers boards added since the last server read.
 */
export function boardChips(
  data: CardBoardsResponse,
  selectedIds: string[],
  names: ReadonlyMap<string, string>,
): BoardChip[] {
  const current = new Map(data.boards.map((b) => [b.id, b]));
  const mine = (id: string) => current.get(id)?.canRemove ?? true;
  const ownCount = selectedIds.filter(mine).length;
  return selectedIds
    .filter((id) => current.has(id) || names.has(id))
    .map((id) => ({
      id,
      name: current.get(id)?.name ?? names.get(id)!,
      removable: data.canChange && mine(id) && ownCount > 1,
    }));
}

/**
 * What the add-board popup lists: with nothing typed, the first
 * `RECENT_BOARDS` of the user's boards (the server sends them latest-used
 * first); while typing, the boards whose name contains the text. Boards the
 * task is already on never show.
 */
export function pickBoards<T extends { id: string; name: string }>(options: T[], excludeIds: string[], term: string): T[] {
  const exclude = new Set(excludeIds);
  const available = options.filter((o) => !exclude.has(o.id));
  const needle = term.trim().toLowerCase();
  if (!needle) return available.slice(0, RECENT_BOARDS);
  return available.filter((o) => o.name.toLowerCase().includes(needle)).slice(0, MATCH_LIMIT);
}

/**
 * The letter on a board's badge. Nearly every board name starts with the
 * article «ال» («الكهرباء»، «الجامع»), so the plain first letter would be «ا»
 * on every badge — the article is skipped.
 */
export function boardInitial(name: string): string {
  const word = name.trim().split(/\s+/)[0] ?? "";
  const stem = word.startsWith("ال") && word.length > 3 ? word.slice(2) : word;
  return stem.charAt(0).toUpperCase();
}
