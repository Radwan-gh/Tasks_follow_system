import type { CardPlacement, ListStatusCategory, RecurrenceRule } from "@app/types";
import { listOnBoard } from "./card-boards";
import { formatDueDate } from "./date";

/*
 * A recurring task is one card: moving it to «انتهى» records the finished cycle
 * and the server puts the same card straight back in «جديد» with its next due
 * date (docs/14-notifications-comments-attachments.md). A screen that moves it
 * therefore shows it landing in «جديد», not «انتهى», and says why.
 */

/** Whether moving `card` into `target` completes a cycle rather than closing it for good. */
export function completesCycle(
  card: { recurrence: RecurrenceRule | null },
  target: { statusCategory: ListStatusCategory | null } | undefined,
): boolean {
  return !!card.recurrence && target?.statusCategory === "CLOSED";
}

/**
 * The notice after the server answered a move into `targetListId`: null for an
 * ordinary move (the task is where it was sent), else «اكتملت الدورة، وعادت
 * المهمة إلى «جديد» بموعد 17 أكتوبر» naming where it actually landed on `boardId`.
 */
export function reopenedNotice(
  moved: { listId: string; placements: CardPlacement[]; dueDate: string | null },
  boardId: string | undefined,
  lists: { id: string; name: string }[],
  targetListId: string,
): string | null {
  const landed = listOnBoard(moved, boardId);
  if (landed === targetListId) return null;
  const name = lists.find((l) => l.id === landed)?.name ?? "جديد";
  return `اكتملت الدورة، وعادت المهمة إلى «${name}»${moved.dueDate ? ` بموعد ${formatDueDate(moved.dueDate)}` : ""}`;
}
