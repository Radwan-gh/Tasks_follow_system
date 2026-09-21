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

/** A task is overdue only if it carries its own due date — subtask rows never do. */
export function isOverdueItem(item: MyTaskItem, now = new Date()): boolean {
  return Boolean(item.dueDate) && new Date(item.dueDate!) < now;
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
