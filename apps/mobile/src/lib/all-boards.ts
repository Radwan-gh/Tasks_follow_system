import type { BoardCard, BoardDetail, ListStatusCategory } from "@app/types";

/** A task on «الكل» — the card plus which board it is on and where its ← goes. */
export interface MergedCard {
  card: BoardCard;
  boardId: string;
  boardName: string;
  /** The next unarchived list on the card's own board — what ← moves it to. */
  nextListId: string | null;
  /** Whether ← is offered: a writable board, a next list, and leave to enter «انتهى» if that is next. */
  canMoveNext: boolean;
}

export interface MergedColumn {
  /** The status category, or `OTHER` for hand-made lists with none. */
  key: ListStatusCategory | "OTHER";
  name: string;
  cards: MergedCard[];
}

const COLUMNS: { key: ListStatusCategory | "OTHER"; name: string; always: boolean }[] = [
  { key: "NEW", name: "جديد", always: true },
  { key: "READY", name: "جاهز", always: true },
  { key: "REVIEW", name: "مراجعة", always: false },
  { key: "IN_PROGRESS", name: "قيد التنفيذ", always: true },
  { key: "DONE", name: "منجز", always: true },
  { key: "CLOSED", name: "انتهى", always: true },
  { key: "OTHER", name: "أخرى", always: false },
];

/**
 * «الكل» (`app/all-tasks.tsx`): every board's columns merged into one board by
 * status category — the five standard statuses always, a legacy «مراجعة» or
 * hand-made lists («أخرى») only when they hold something.
 *
 * - Board order, then each list's own order, is kept inside a column.
 * - A task on several boards (docs/18-multi-board-tasks.md) appears once,
 *   from the first board that has it.
 * - ← follows the board screen's rules for the card's own board: none on an
 *   archived board or for a viewer/supervisor, and into «انتهى» only for the
 *   board's owner or the card's assignees.
 */
export function mergeBoardColumns(boards: readonly BoardDetail[], userId: string | undefined): MergedColumn[] {
  const byKey = new Map(COLUMNS.map((c) => [c.key, [] as MergedCard[]]));
  const seen = new Set<string>();
  for (const board of boards) {
    const myRole = board.members.find((m) => m.userId === userId)?.role;
    const readOnly = board.isArchived || board.supervised || myRole === "VIEWER" || !userId;
    const lists = board.lists.filter((list) => !list.isArchived);
    lists.forEach((list, index) => {
      const next = lists[index + 1];
      const key = list.statusCategory ?? "OTHER";
      const column = byKey.get(key) ?? byKey.get("OTHER")!;
      for (const card of list.cards) {
        if (card.isArchived || seen.has(card.id)) continue;
        seen.add(card.id);
        const mayClose = board.ownerId === userId || (!!userId && card.assigneeIds.includes(userId));
        column.push({
          card,
          boardId: board.id,
          boardName: board.name,
          nextListId: next?.id ?? null,
          canMoveNext: !readOnly && !!next && (next.statusCategory !== "CLOSED" || mayClose),
        });
      }
    });
  }
  return COLUMNS.filter((c) => c.always || byKey.get(c.key)!.length > 0).map((c) => ({
    key: c.key,
    name: c.name,
    cards: byKey.get(c.key)!,
  }));
}
