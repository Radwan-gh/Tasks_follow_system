import { z } from "zod";

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
  // Subtasks have no due date of their own — always null for SUBTASK rows.
  dueDate: z.string().datetime().nullable(),
});
export type MyTaskItem = z.infer<typeof MyTaskItemSchema>;

/**
 * Not a report — no ADMIN gate, every user sees their own assignments only.
 * Excludes cards/subtasks whose list `isCompleted()` (`DONE`/`CLOSED`) and
 * anything archived. Sorting/grouping (overdue-first, then by board) is a
 * display concern left to the client, same as the reports section.
 */
export const MyTasksResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  items: z.array(MyTaskItemSchema),
});
export type MyTasksResponse = z.infer<typeof MyTasksResponseSchema>;
