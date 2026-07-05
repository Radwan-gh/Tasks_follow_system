import { z } from "zod";

export const BoardRole = z.enum(["OWNER", "MEMBER"]);
export type BoardRole = z.infer<typeof BoardRole>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Card = z.infer<typeof CardSchema>;

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
