import type { MyTaskItem } from "./my-tasks";

/**
 * Folding board groups on «مهامي». Mobile imports these; web keeps a hand
 * mirror in `apps/web/src/features/my-tasks/my-tasks-folds.ts` (Vite cannot
 * name-import runtime code from this CommonJS package) — so both apps
 * fold, summarise and remember the same way (design: «مهامي — طيّ اللوحات»
 * in `docs/app_design/Tasks Mobile Redesign.dc.html`).
 *
 * Groups start open; what is stored per user is the set of *folded* board
 * ids, so a board that shows up later appears open. The «متأخّرة» section is
 * never foldable, so overdue work cannot be hidden.
 */

/** What a folded board group still shows instead of its rows. */
export interface FoldedGroupSummary {
  /** Rows on the board whose task is «عاجل». */
  urgentCount: number;
  /** The earliest `dueDate` among the rows, or null when none has one. */
  nextDueDate: string | null;
}

export function summarizeFoldedGroup(items: readonly Pick<MyTaskItem, "priority" | "dueDate">[]): FoldedGroupSummary {
  let urgentCount = 0;
  let nextDueDate: string | null = null;
  for (const item of items) {
    if (item.priority === "URGENT") urgentCount += 1;
    if (item.dueDate && (nextDueDate === null || Date.parse(item.dueDate) < Date.parse(nextDueDate))) {
      nextDueDate = item.dueDate;
    }
  }
  return { urgentCount, nextDueDate };
}

/**
 * Fold or unfold one board. Ids of boards no longer on the screen (finished,
 * unassigned, left) are dropped so the stored set does not grow forever.
 */
export function toggleFoldedBoard(
  folded: ReadonlySet<string>,
  boardId: string,
  liveBoardIds: readonly string[],
): Set<string> {
  const live = new Set(liveBoardIds);
  const next = new Set([...folded].filter((id) => live.has(id)));
  if (!next.delete(boardId)) next.add(boardId);
  return next;
}

/** True when at least one of the shown board groups is open. */
export function anyBoardOpen(folded: ReadonlySet<string>, liveBoardIds: readonly string[]): boolean {
  return liveBoardIds.some((id) => !folded.has(id));
}

/** «طيّ الكل» while any group is open, otherwise «فتح الكل». */
export function toggleAllBoards(folded: ReadonlySet<string>, liveBoardIds: readonly string[]): Set<string> {
  return anyBoardOpen(folded, liveBoardIds) ? new Set(liveBoardIds) : new Set();
}
