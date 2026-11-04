import { z } from "zod";
import { CardPriority, ListStatusCategory } from "./domain";

/**
 * One row in `GET /my-tasks` — either a card or a subtask assigned to the
 * current user. A subtask row carries `parentCardTitle` because it may be
 * assigned to me without the card itself being assigned to me (see
 * `v2-new-style.md` §7.1). `cardId` always points at the card to open —
 * for a `SUBTASK` row that's its parent, not the subtask itself (subtasks
 * have no detail screen of their own).
 */
export const MyTaskItemSchema = z.object({
  kind: z.enum(["CARD", "SUBTASK"]),
  id: z.string(),
  title: z.string(),
  parentCardTitle: z.string().nullable(),
  cardId: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  listName: z.string(),
  // The list the task sits in on that board, and the one after it in board
  // order (null when it is already in the last list) — the row's ← arrow
  // moves a CARD row there, as on the board screen. A SUBTASK row carries
  // its parent card's, but has no arrow.
  listId: z.string(),
  nextListId: z.string().nullable(),
  // The status category of that list (a subtask row: its parent card's) —
  // colours the per-task strip on a folded board group in «مهامي». Null for
  // a manually created list, which has no category.
  statusCategory: ListStatusCategory.nullable(),
  // A subtask has no due date of its own, so a SUBTASK row carries its parent
  // card's — the design dates (and files as overdue) a subtask by its card.
  dueDate: z.string().datetime().nullable(),
  // The «☑ 3/5» fraction on a CARD row. Always 0/0 on a SUBTASK row.
  subtaskDone: z.number().int(),
  subtaskTotal: z.number().int(),
  // The parent card's priority (a subtask has no priority of its own) — used
  // for "مهامي" ordering: overdue first, then urgent — `design-prompt-group-3.md` §3b-1.
  priority: CardPriority,
});
export type MyTaskItem = z.infer<typeof MyTaskItemSchema>;

/**
 * Not a report — no ADMIN gate, every user sees their own assignments only.
 * Excludes cards/subtasks whose list `isCompleted()` (`DONE`/`CLOSED`),
 * subtasks already ticked done, and anything archived. Sorting/grouping (overdue-first, then by board) is a
 * display concern left to the client, same as the reports section.
 */
export const MyTasksResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  items: z.array(MyTaskItemSchema),
});
export type MyTasksResponse = z.infer<typeof MyTasksResponseSchema>;
