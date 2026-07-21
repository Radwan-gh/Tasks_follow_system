import { z } from "zod";

export const BoardRole = z.enum(["OWNER", "MEMBER"]);
export type BoardRole = z.infer<typeof BoardRole>;

export const UserRole = z.enum(["USER", "ADMIN"]);
export type UserRole = z.infer<typeof UserRole>;

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

/** One tick-box on a card. `recurringSubtaskId` is set only for items spawned
 *  from a recurring template (and is the stable identity a report groups by). */
export const ChecklistItemSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  recurringSubtaskId: z.string().nullable(),
  label: z.string().min(1).max(300),
  position: z.string(),
  isCompleted: z.boolean(),
  completedAt: z.string().datetime().nullable(),
  completedById: z.string().nullable(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Set when the card is an occurrence spawned from a recurring template.
  recurringTaskId: z.string().nullable().optional(),
  occurrenceStart: z.string().datetime().nullable().optional(),
  // Embedded in board detail so the tile can show a progress badge; omitted
  // by endpoints that don't join the checklist (treat as empty then).
  checklist: z.array(ChecklistItemSchema).optional(),
});
export type Card = z.infer<typeof CardSchema>;

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
  "CHECKLIST_ITEM_ADDED",
  "CHECKLIST_ITEM_COMPLETED",
  "CHECKLIST_ITEM_UNCOMPLETED",
  "CHECKLIST_ITEM_REMOVED",
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
  createdAt: z.string().datetime(),
  cards: z.array(CardSchema),
});
export type List = z.infer<typeof ListSchema>;

export const BoardDetailSchema = BoardSummarySchema.extend({
  lists: z.array(ListSchema),
  members: z.array(BoardMemberSchema),
});
export type BoardDetail = z.infer<typeof BoardDetailSchema>;

// ---------------------------------------------------------------------------
// Recurring tasks
// ---------------------------------------------------------------------------

export const RecurrenceCadence = z.enum(["WEEKLY"]);
export type RecurrenceCadence = z.infer<typeof RecurrenceCadence>;

export const RecurringSubtaskSchema = z.object({
  id: z.string(),
  recurringTaskId: z.string(),
  label: z.string().min(1).max(300),
  position: z.string(),
});
export type RecurringSubtask = z.infer<typeof RecurringSubtaskSchema>;

/** A recurring-task template plus its fixed subtasks. */
export const RecurringTaskSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  targetListId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).nullable(),
  cadence: RecurrenceCadence,
  isActive: z.boolean(),
  position: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  subtasks: z.array(RecurringSubtaskSchema),
});
export type RecurringTask = z.infer<typeof RecurringTaskSchema>;

// ---------------------------------------------------------------------------
// Recurring completion report
// ---------------------------------------------------------------------------

/** One period (week) column in the report grid. */
export const ReportOccurrenceSchema = z.object({
  cardId: z.string(),
  occurrenceStart: z.string().datetime(),
});
export type ReportOccurrence = z.infer<typeof ReportOccurrenceSchema>;

/** One subtask row: whether it was done in each occurrence, plus a tally. */
export const ReportSubtaskRowSchema = z.object({
  recurringSubtaskId: z.string(),
  label: z.string(),
  completedCount: z.number().int(),
  totalCount: z.number().int(),
  cells: z.array(
    z.object({
      occurrenceStart: z.string().datetime(),
      isCompleted: z.boolean(),
      completedAt: z.string().datetime().nullable(),
    }),
  ),
});
export type ReportSubtaskRow = z.infer<typeof ReportSubtaskRowSchema>;

export const ReportTaskSchema = z.object({
  recurringTaskId: z.string(),
  title: z.string(),
  occurrences: z.array(ReportOccurrenceSchema),
  subtasks: z.array(ReportSubtaskRowSchema),
});
export type ReportTask = z.infer<typeof ReportTaskSchema>;

export const RecurringReportSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  tasks: z.array(ReportTaskSchema),
});
export type RecurringReport = z.infer<typeof RecurringReportSchema>;
