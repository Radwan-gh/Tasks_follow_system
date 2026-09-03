import { z } from "zod";

/** `VIEWER` is read-only: no move/create/comment/assign anywhere on the board. */
export const BoardRole = z.enum(["OWNER", "MEMBER", "VIEWER"]);
export type BoardRole = z.infer<typeof BoardRole>;

export const UserRole = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof UserRole>;

/**
 * Semantic status category of a list, set when a board is seeded from a
 * built-in template. A card's *status* is the list it lives in; this optional
 * category lets features (notably the reports section) reason about a list's
 * meaning — especially the terminal `DONE`/`CLOSED` — without relying on the
 * list's (renameable, localized) name. Manually created lists carry `null`.
 *
 * `CLOSED` is a newer terminal status *after* `DONE` ("انتهى" — delivered and
 * confirmed). Anything that used to check `statusCategory === "DONE"` alone
 * must use `isCompleted()` (`apps/api/src/common/util/completed.util.ts`)
 * instead, which treats `DONE | CLOSED` as done. `REVIEW` is retired from the
 * current board template (see `board-templates.ts`) but stays valid for lists
 * created before this change — never remove it from this enum.
 */
export const ListStatusCategory = z.enum(["NEW", "READY", "IN_PROGRESS", "REVIEW", "DONE", "CLOSED"]);
export type ListStatusCategory = z.infer<typeof ListStatusCategory>;

/**
 * "عاجل" (urgent) is the only priority ever shown on the card face (as an
 * edge stripe); `NORMAL` (default) and `LOW` carry no face indicator — see
 * `design-prompt-group-3.md` §3b-1.
 */
export const CardPriority = z.enum(["LOW", "NORMAL", "URGENT"]);
export type CardPriority = z.infer<typeof CardPriority>;

/**
 * A card's repeat rule. On move into a `CLOSED` list, the server spawns the
 * next instance into the board's `NEW` list with `dueDate` advanced by one
 * interval — see `design-prompt-group-3.md` §3a-3/§9 ("لا تتراكم نسخ متعددة").
 */
export const RecurrenceRuleSchema = z.discriminatedUnion("freq", [
  z.object({ freq: z.literal("DAILY") }),
  z.object({ freq: z.literal("WEEKLY"), weekdays: z.array(z.number().int().min(0).max(6)).min(1) }),
  z.object({ freq: z.literal("MONTHLY"), dayOfMonth: z.number().int().min(1).max(31) }),
]);
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

/** Three notification-category toggles, all default `true` — `account.tsx`'s "الإشعارات" section. */
export const NotificationPrefsSchema = z.object({
  assignmentsAndComments: z.boolean().default(true),
  dueDatesAndOverdue: z.boolean().default(true),
  myCardsMoved: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: UserRole,
  isActive: z.boolean(),
  // Set by an admin's `POST /admin/users/:id/reset-password`; the client uses
  // this to route straight to "عيّن كلمة مرور جديدة" instead of the tabs.
  mustChangePassword: z.boolean(),
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
  // `isActive` lets the mobile client fade a disabled member's avatar and
  // badge them "معطَّل" wherever they're shown as an assignee — see
  // `design-prompt-group-3.md` §3b-6.
  user: UserSchema.pick({ id: true, email: true, displayName: true, isActive: true }),
});
export type BoardMember = z.infer<typeof BoardMemberSchema>;

export const BoardSummarySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  // Optional target completion date for the whole board. Never rendered when
  // null — no placeholder text, no empty chip (`v2-new-style.md` §1).
  dueDate: z.string().datetime().nullable(),
  isArchived: z.boolean(),
  ownerId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Aggregates for the boards-list card's progress bar + "n مهمة · m مكتملة"
  // counter (`v2-new-style.md` §3) — computed server-side via one `groupBy`
  // per field across all the user's boards, not per-board queries.
  memberCount: z.number().int(),
  cardCount: z.number().int(),
  doneCount: z.number().int(),
  // First few members, for the boards-list card's overlapping avatars. Not
  // the full membership (that's `BoardDetail.members`) — just enough to draw
  // 2-3 avatar circles.
  memberPreviews: z.array(UserSchema.pick({ id: true, displayName: true })),
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
  // Whether `dueDate` carries a meaningful time-of-day (§3c-5). When false the
  // client renders/treats `dueDate` as date-only, ignoring its time component.
  dueDateHasTime: z.boolean(),
  createdById: z.string(),
  isArchived: z.boolean(),
  // Access control: when false the card inherits board membership. When true
  // only `memberIds` (plus the board owner and creator) may see/edit it.
  isRestricted: z.boolean(),
  memberIds: z.array(z.string()),
  // People this task is assigned to (a card can be assigned to several board
  // members). Distinct from `memberIds`, which is an access allow-list.
  assigneeIds: z.array(z.string()),
  priority: CardPriority,
  // Amount + optional free-text note (invoice #, vendor). Never shown on the
  // card face — details-screen-only chip. `costAmount` is a decimal string
  // (Prisma `Decimal` serializes as string) so precision survives JSON.
  costAmount: z.string().nullable(),
  costNote: z.string().max(500).nullable(),
  recurrence: RecurrenceRuleSchema.nullable(),
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
  "COST_UPDATED",
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

/**
 * Report 3b-5 — `GET /boards/:id/summary`, owner-only. Spares the board
 * owner a trip to the ADMIN-only `/reports/*` section: last-7-days
 * completions, current overdue count, a top-3 workload split (`workload`)
 * plus how many more assignees are folded into "الباقي"
 * (`workloadRestCount`), and this month's total cost — `null` when no card
 * on the board carries a cost yet (never rendered as "0"). See
 * `design-prompt-group-3.md` §3b-5.
 */
export const BoardOwnerSummarySchema = z.object({
  completedLast7Days: z.number().int(),
  overdueCount: z.number().int(),
  workload: z.array(z.object({ userId: z.string(), displayName: z.string(), openCards: z.number().int() })),
  workloadRestCount: z.number().int(),
  costThisMonth: z.string().nullable(),
});
export type BoardOwnerSummary = z.infer<typeof BoardOwnerSummarySchema>;

/**
 * A text comment on a card. Rendered merged with `CardActivity` into one
 * timeline client-side (`GET /cards/:id/comments` alongside
 * `GET /cards/:id/history`) rather than folded into `CardActivitySchema`'s
 * shape — comments and system events have different fields and a forced
 * union would be worse than a light client-side merge by timestamp.
 */
export const CommentSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  body: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
  author: UserSchema.pick({ id: true, email: true, displayName: true }),
});
export type Comment = z.infer<typeof CommentSchema>;

/** An image attached to a card. `url` is a path the client resolves against the API base URL. */
export const AttachmentSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  url: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.string().datetime(),
  uploader: UserSchema.pick({ id: true, email: true, displayName: true }),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * In-app notification types. No OS push — see `apps/mobile/TASKS.md` (push
 * notifications are a separate, unscoped item). `payload` carries the bits
 * needed to render the two-line row and route on tap without a second fetch.
 */
export const NotificationType = z.enum([
  "ASSIGNED",
  "DUE_SOON",
  "OVERDUE",
  "COMMENT",
  "CARD_CLOSED",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationType,
  cardId: z.string().nullable(),
  boardId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof NotificationSchema>;

/**
 * A board-owner-managed task template: picking it prefills title/description/
 * subtasks on the add-task screen. Distinct from `board-templates.ts`'s
 * `TASK_WORKFLOW_TEMPLATE`, which seeds a *board's lists*, not a card.
 */
export const TemplateSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  name: z.string().min(1).max(100),
  titlePattern: z.string().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  subtaskTitles: z.array(z.string().min(1).max(300)),
  createdAt: z.string().datetime(),
});
export type Template = z.infer<typeof TemplateSchema>;

/** Global app settings — a single row, currently just the currency symbol shown next to every cost amount (§3c-1). */
export const AppSettingsSchema = z.object({
  currencySymbol: z.string().min(1).max(10),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
