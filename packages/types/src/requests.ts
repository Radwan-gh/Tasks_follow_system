import { z } from "zod";
import { RecurrenceCadence, UserRole } from "./domain";

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(100),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const CreateBoardRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
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

// ---------------------------------------------------------------------------
// Checklist items (subtasks on a card)
// ---------------------------------------------------------------------------

export const CreateChecklistItemRequestSchema = z.object({
  label: z.string().min(1).max(300),
});
export type CreateChecklistItemRequest = z.infer<typeof CreateChecklistItemRequestSchema>;

export const UpdateChecklistItemRequestSchema = z.object({
  label: z.string().min(1).max(300).optional(),
  isCompleted: z.boolean().optional(),
  move: MoveTargetSchema.optional(),
});
export type UpdateChecklistItemRequest = z.infer<typeof UpdateChecklistItemRequestSchema>;

// ---------------------------------------------------------------------------
// Recurring tasks
// ---------------------------------------------------------------------------

export const CreateRecurringTaskRequestSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(10_000).optional(),
  targetListId: z.string().min(1),
  cadence: RecurrenceCadence.optional(),
  // The fixed subtask labels, in display order.
  subtasks: z.array(z.string().min(1).max(300)).max(100).default([]),
});
export type CreateRecurringTaskRequest = z.infer<typeof CreateRecurringTaskRequestSchema>;

export const UpdateRecurringTaskRequestSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10_000).nullable().optional(),
  targetListId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateRecurringTaskRequest = z.infer<typeof UpdateRecurringTaskRequestSchema>;

export const CreateRecurringSubtaskRequestSchema = z.object({
  label: z.string().min(1).max(300),
});
export type CreateRecurringSubtaskRequest = z.infer<typeof CreateRecurringSubtaskRequestSchema>;

export const UpdateRecurringSubtaskRequestSchema = z.object({
  label: z.string().min(1).max(300).optional(),
  move: MoveTargetSchema.optional(),
});
export type UpdateRecurringSubtaskRequest = z.infer<typeof UpdateRecurringSubtaskRequestSchema>;

/**
 * Report window. Both bounds optional — the service defaults to the previous
 * calendar month. `from` is inclusive, `to` exclusive.
 */
export const RecurringReportQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type RecurringReportQuery = z.infer<typeof RecurringReportQuerySchema>;
