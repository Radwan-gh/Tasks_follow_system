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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
