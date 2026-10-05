import { z } from "zod";
import { BoardSummarySchema, CardPriority, ListStatusCategory, UserSchema } from "./domain";

/**
 * Oversight («المتابعة», `/oversight/*`) — a read-only view across every board
 * and task, regardless of board membership. Open to anyone `canSupervise()`
 * allows (an ADMIN, or a user an admin granted `canViewAllBoards`). Opening a
 * board or card from here goes through the normal `GET /boards/:id` /
 * `GET /cards/:id`, which admit a supervisor as a read-only viewer
 * (`BoardDetail.supervised`).
 */

const OversightPersonSchema = UserSchema.pick({ id: true, username: true, displayName: true });

// --- Boards ---

export const OversightBoardsQuerySchema = z.object({
  /** `true` lists archived boards instead of active ones. */
  archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
export type OversightBoardsQuery = z.input<typeof OversightBoardsQuerySchema>;

export const OversightBoardSchema = BoardSummarySchema.extend({
  owner: OversightPersonSchema,
});
export type OversightBoard = z.infer<typeof OversightBoardSchema>;

// --- Tasks ---

export const OversightTasksQuerySchema = z.object({
  /** Only cards assigned to this user. */
  assigneeId: z.string().min(1).optional(),
  boardId: z.string().min(1).optional(),
  statusCategory: ListStatusCategory.optional(),
  /** Due-date window, inclusive (ISO dates). */
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  /** Past due and not in a completed (`DONE`/`CLOSED`) list. */
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  /** By default completed cards are left out; `true` includes them. Ignored when `statusCategory` is set. */
  includeCompleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  /** Case-insensitive title search. */
  q: z.string().trim().max(200).optional(),
  /** `nextCursor` from the previous page. */
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
/** What a client sends (query-string shapes). */
export type OversightTasksQuery = z.input<typeof OversightTasksQuerySchema>;
/** What the server works with after parsing (booleans, defaulted `limit`). */
export type OversightTasksFilter = z.output<typeof OversightTasksQuerySchema>;

export const OversightTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  boardIsArchived: z.boolean(),
  listName: z.string(),
  statusCategory: ListStatusCategory.nullable(),
  priority: CardPriority,
  dueDate: z.string().datetime().nullable(),
  isRestricted: z.boolean(),
  createdBy: OversightPersonSchema,
  assignees: z.array(OversightPersonSchema),
  subtaskTotal: z.number().int(),
  subtaskDone: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type OversightTask = z.infer<typeof OversightTaskSchema>;

export const OversightTasksResponseSchema = z.object({
  items: z.array(OversightTaskSchema),
  /** Pass back as `cursor` to load the next page; `null` when there is none. */
  nextCursor: z.string().nullable(),
});
export type OversightTasksResponse = z.infer<typeof OversightTasksResponseSchema>;

// --- People (for the assignee filter; a supervisor need not be an ADMIN) ---

export const OversightUserSchema = UserSchema.pick({ id: true, username: true, displayName: true, isActive: true });
export type OversightUser = z.infer<typeof OversightUserSchema>;
