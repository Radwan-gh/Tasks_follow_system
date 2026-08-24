import { z } from "zod";

export const BoardRole = z.enum(["OWNER", "MEMBER"]);
export type BoardRole = z.infer<typeof BoardRole>;

export const UserRole = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof UserRole>;

/**
 * Semantic status category of a list, set when a board is seeded from a
 * built-in template. A card's *status* is the list it lives in; this optional
 * category lets features (notably the reports section) reason about a list's
 * meaning — especially the terminal ones — without relying on the list's
 * (renameable, localized) name. Manually created lists carry `null`.
 *
 * `REVIEW` ("بانتظار تقييم") was dropped from the built-in template when
 * `CLOSED` was added, but remains a valid value: boards seeded before that
 * still have a list carrying it.
 */
export const ListStatusCategory = z.enum([
  "NEW",
  "READY",
  "IN_PROGRESS",
  "REVIEW",
  "DONE",
  "CLOSED",
]);
export type ListStatusCategory = z.infer<typeof ListStatusCategory>;

/**
 * The categories that mean "this work is finished".
 *
 * `DONE` ("تم التنفيذ") is done; `CLOSED` ("انتهى") is delivered and
 * confirmed. They collapse into one idea — *not open* — for anything counting
 * outstanding work: overdue tasks, a person's workload, "مهامي".
 *
 * They deliberately do **not** collapse for *completion timing*. A task is
 * counted as completed at its **first** move into `DONE`, so a card that
 * passes `DONE` and then `CLOSED` in the same week is counted once, and
 * average completion time stops at `DONE` rather than including however long
 * confirmation took. See `docs/11-reports.md`.
 *
 * Typed as a mutable array rather than a `readonly` tuple because Prisma's
 * generated `in:` filters reject `readonly` arrays.
 */
export const COMPLETED_CATEGORIES: ListStatusCategory[] = ["DONE", "CLOSED"];

/**
 * Whether a list's category means the work in it is finished. Manual lists
 * (`null`) are not — the same rule the reports have always applied.
 *
 * Shared by the API, the web app and the mobile app so the definition of
 * "open" cannot drift between them.
 */
export function isCompleted(category: ListStatusCategory | null | undefined): boolean {
  return category === "DONE" || category === "CLOSED";
}

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: UserRole,
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

/** Shape returned by GET /auth/me and stored client-side as the logged-in user. */
export const CurrentUserSchema = UserSchema;
export type CurrentUser = z.infer<typeof CurrentUserSchema>;

/** Row shape for the admin users table. */
export const AdminUserSchema = UserSchema.extend({
  boardCount: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const AdminUserListSchema = z.object({
  users: z.array(AdminUserSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminUserList = z.infer<typeof AdminUserListSchema>;

export const BoardMemberSchema = z.object({
  userId: z.string(),
  boardId: z.string(),
  role: BoardRole,
  user: UserSchema.pick({ id: true, email: true, displayName: true }),
});
export type BoardMember = z.infer<typeof BoardMemberSchema>;

export const BoardSummarySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  isArchived: z.boolean(),
  ownerId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BoardSummary = z.infer<typeof BoardSummarySchema>;

export const CardSchema = z.object({
  id: z.string(),
  listId: z.string(),
  boardId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  position: z.string(),
  dueDate: z.string().datetime().nullable(),
  createdById: z.string(),
  isArchived: z.boolean(),
  // Access control: when false the card inherits board membership. When true
  // only `memberIds` (plus the board owner and creator) may see/edit it.
  isRestricted: z.boolean(),
  memberIds: z.array(z.string()),
  // People this task is assigned to (a card can be assigned to several board
  // members). Distinct from `memberIds`, which is an access allow-list.
  assigneeIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Card = z.infer<typeof CardSchema>;

/**
 * A sub-task ("مهمة فرعية") belonging to a card. Ordered within its parent
 * card via a fractional-index `position` (same scheme as lists/cards), can be
 * checked off (`isDone`), and can be assigned to several board members.
 */
export const SubtaskSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  title: z.string().min(1).max(300),
  isDone: z.boolean(),
  position: z.string(),
  createdById: z.string(),
  assigneeIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

/**
 * Kinds of card ("task") history events. A card's *status* in this Kanban
 * model is the list it lives in, so a status change is a `MOVED` event whose
 * `fromValue`/`toValue` are the previous/new list names.
 */
export const CardActivityType = z.enum([
  "CREATED",
  "MOVED",
  "RENAMED",
  "DESCRIPTION_UPDATED",
  "DUE_DATE_CHANGED",
  "ARCHIVED",
  "UNARCHIVED",
  // Assignment changes: `toValue` holds a snapshot of the assignees' names
  // after the change (comma-separated), or null when cleared.
  "ASSIGNED",
  "UNASSIGNED",
]);
export type CardActivityType = z.infer<typeof CardActivityType>;

/**
 * One immutable entry in a card's history. `fromValue`/`toValue` hold a
 * human-readable snapshot captured at the time of the change (list names for
 * moves, titles for renames, ISO dates for due-date changes); they are null
 * where a before/after value doesn't apply.
 */
export const CardActivitySchema = z.object({
  id: z.string(),
  cardId: z.string(),
  type: CardActivityType,
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  createdAt: z.string().datetime(),
  actor: UserSchema.pick({ id: true, email: true, displayName: true }),
});
export type CardActivity = z.infer<typeof CardActivitySchema>;

export const ListSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string().min(1).max(200),
  position: z.string(),
  isArchived: z.boolean(),
  statusCategory: ListStatusCategory.nullable(),
  createdAt: z.string().datetime(),
  cards: z.array(CardSchema),
});
export type List = z.infer<typeof ListSchema>;

export const BoardDetailSchema = BoardSummarySchema.extend({
  lists: z.array(ListSchema),
  members: z.array(BoardMemberSchema),
});
export type BoardDetail = z.infer<typeof BoardDetailSchema>;
