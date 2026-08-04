import { z } from "zod";
import { UserRole } from "./domain";

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Self-service password change for the logged-in user. Requires the current
 * password (re-authentication) plus the new one — see `POST /auth/change-password`.
 */
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Which starter layout to seed a new board with. `EMPTY` (default) keeps the
 * historical behavior of a board with zero lists; `TASK_WORKFLOW` seeds the
 * five status lists (جديد ← جاهز للتنفيذ ← قيد التنفيذ ← بانتظار تقييم ← تم
 * التنفيذ) with their `statusCategory` set.
 */
export const BoardTemplate = z.enum(["EMPTY", "TASK_WORKFLOW"]);
export type BoardTemplate = z.infer<typeof BoardTemplate>;

export const CreateBoardRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  template: BoardTemplate.optional(),
});
export type CreateBoardRequest = z.infer<typeof CreateBoardRequestSchema>;

export const UpdateBoardRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateBoardRequest = z.infer<typeof UpdateBoardRequestSchema>;

export const AddBoardMemberRequestSchema = z.object({
  email: z.string().email(),
});
export type AddBoardMemberRequest = z.infer<typeof AddBoardMemberRequestSchema>;

/**
 * Admin-only creation of a user account. Public self-registration was removed —
 * new accounts are provisioned by an admin, who sets the initial password and
 * (optionally) the role. See `POST /admin/users`.
 */
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(100),
  role: UserRole.optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

/** Admin-only reset of another user's password. See `PATCH /admin/users/:id/password`. */
export const AdminSetPasswordRequestSchema = z.object({
  password: z.string().min(8).max(200),
});
export type AdminSetPasswordRequest = z.infer<typeof AdminSetPasswordRequestSchema>;

export const ListUsersQuerySchema = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

export const UpdateUserRoleRequestSchema = z.object({
  role: UserRole,
});
export type UpdateUserRoleRequest = z.infer<typeof UpdateUserRoleRequestSchema>;

export const UpdateUserStatusRequestSchema = z.object({
  isActive: z.boolean(),
});
export type UpdateUserStatusRequest = z.infer<typeof UpdateUserStatusRequestSchema>;

export const CreateListRequestSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateListRequest = z.infer<typeof CreateListRequestSchema>;

/**
 * Reorder by referencing neighbor IDs rather than raw position strings —
 * the server re-reads current neighbor positions fresh inside a transaction
 * and computes the new fractional key itself, so a stale client-computed
 * position can never corrupt ordering.
 */
export const MoveTargetSchema = z.object({
  beforeId: z.string().nullable().optional(),
  afterId: z.string().nullable().optional(),
});
export type MoveTarget = z.infer<typeof MoveTargetSchema>;

export const UpdateListRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
  move: MoveTargetSchema.optional(),
});
export type UpdateListRequest = z.infer<typeof UpdateListRequestSchema>;

export const CreateCardRequestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateCardRequest = z.infer<typeof CreateCardRequestSchema>;

export const UpdateCardRequestSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10_000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  isArchived: z.boolean().optional(),
  targetListId: z.string().optional(),
  move: MoveTargetSchema.optional(),
});
export type UpdateCardRequest = z.infer<typeof UpdateCardRequestSchema>;

/**
 * Atomic full-replace of a card's access config. `isRestricted: false` opens
 * the card back up to all board members (memberUserIds ignored/cleared);
 * `true` limits it to the listed board members (plus owner/creator).
 */
export const UpdateCardAccessRequestSchema = z.object({
  isRestricted: z.boolean(),
  memberUserIds: z.array(z.string()),
});
export type UpdateCardAccessRequest = z.infer<typeof UpdateCardAccessRequestSchema>;

export const CreateSubtaskRequestSchema = z.object({
  title: z.string().min(1).max(300),
});
export type CreateSubtaskRequest = z.infer<typeof CreateSubtaskRequestSchema>;

export const UpdateSubtaskRequestSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  isDone: z.boolean().optional(),
  move: MoveTargetSchema.optional(),
});
export type UpdateSubtaskRequest = z.infer<typeof UpdateSubtaskRequestSchema>;

/**
 * Atomic full-replace of an assignee set (for a card or a subtask). Every
 * listed user must be a member of the owning board; duplicates are collapsed.
 */
export const UpdateAssigneesRequestSchema = z.object({
  userIds: z.array(z.string()),
});
export type UpdateAssigneesRequest = z.infer<typeof UpdateAssigneesRequestSchema>;
