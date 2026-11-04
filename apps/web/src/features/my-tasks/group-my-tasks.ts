import type { MyTaskItem } from "@app/types";

export interface MyTasksBoardGroup {
  boardId: string;
  boardName: string;
  items: MyTaskItem[];
}

export interface GroupedMyTasks {
  overdue: MyTaskItem[];
  byBoard: MyTasksBoardGroup[];
}

/** Overdue once its due date has passed — a subtask row carries its card's. */
export function isOverdueItem(item: MyTaskItem, now = new Date()): boolean {
  return Boolean(item.dueDate) && new Date(item.dueDate!) < now;
}

/**
 * «متأخّرة 9 أيام» · «متأخّرة 2 يوم» — whole calendar days since the due
 * date, at least one; the plural only for 3–10. Mirrors mobile's
 * `overdueLabel` (`apps/mobile/src/lib/date.ts`, which has the tests).
 */
export function overdueLabel(iso: string, now = new Date()): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(1, Math.round((startOf(now) - startOf(new Date(iso))) / 86400000));
  const lastTwo = days % 100;
  return `متأخّرة ${days} ${lastTwo >= 3 && lastTwo <= 10 ? "أيام" : "يوم"}`;
}

/**
 * `GET /my-tasks` returns a flat list — grouping/sorting is a client concern
 * by design (`packages/types/src/my-tasks.ts`). Overdue items (any board)
 * come first as one section; everything else is grouped by board, in the
 * order boards first appear in the response.
 */
export function groupMyTasks(items: MyTaskItem[], now = new Date()): GroupedMyTasks {
  const overdue: MyTaskItem[] = [];
  const boards = new Map<string, MyTasksBoardGroup>();

  for (const item of items) {
    if (isOverdueItem(item, now)) {
      overdue.push(item);
      continue;
    }
    let group = boards.get(item.boardId);
    if (!group) {
      group = { boardId: item.boardId, boardName: item.boardName, items: [] };
      boards.set(item.boardId, group);
    }
    group.items.push(item);
  }

  return { overdue, byBoard: Array.from(boards.values()) };
}
