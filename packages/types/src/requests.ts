import { z } from "zod";

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
