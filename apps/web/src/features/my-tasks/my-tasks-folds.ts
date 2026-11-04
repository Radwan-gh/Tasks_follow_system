import type { MyTaskItem } from "@app/types";

/**
 * Folding board groups on «مهامي» — a hand mirror of
 * `packages/types/src/my-tasks-folds.ts` (which mobile imports and
 * `apps/mobile/src/lib/my-tasks-folds.test.ts` covers). The web build cannot
 * name-import runtime code from `@app/types`, which compiles to CommonJS, so
 * keep the two in step: same names, same rules.
 */

export interface FoldedGroupSummary {
  urgentCount: number;
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

export function anyBoardOpen(folded: ReadonlySet<string>, liveBoardIds: readonly string[]): boolean {
  return liveBoardIds.some((id) => !folded.has(id));
}

export function toggleAllBoards(folded: ReadonlySet<string>, liveBoardIds: readonly string[]): Set<string> {
  return anyBoardOpen(folded, liveBoardIds) ? new Set(liveBoardIds) : new Set();
}
