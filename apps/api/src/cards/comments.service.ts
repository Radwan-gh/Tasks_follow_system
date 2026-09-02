import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Comment, CreateCommentRequest } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard } from "../boards/boards.service";
import { NotificationsService } from "../notifications/notifications.service";

function serialize(row: {
  id: string;
  cardId: string;
  body: string;
  createdAt: Date;
  author: { id: string; email: string; displayName: string };
}): Comment {
  return {
    id: row.id,
    cardId: row.cardId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
  };
}

/**
 * Text comments on a card (`design-prompt-group-3.md` §3a-5), merged with
 * `CardActivity` into one timeline client-side. Kept as its own small
 * service/table rather than folded into `CardActivitySchema` — see the
 * `Comment` model's doc comment in `schema.prisma`.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async loadCard(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { members: { select: { userId: true } }, assignees: { select: { userId: true } } },
    });
    if (!card) throw new NotFoundException("Card not found");
    return card;
  }

  private async boardOwnerId(boardId: string): Promise<string> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId }, select: { ownerId: true } });
    if (!board) throw new NotFoundException("Board not found");
    return board.ownerId;
  }

  async list(userId: string, cardId: string): Promise<Comment[]> {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const rows = await this.prisma.comment.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, email: true, displayName: true } } },
    });
    return rows.map(serialize);
  }

  async create(userId: string, cardId: string, input: CreateCommentRequest): Promise<Comment> {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { cardId, authorId: userId, body: input.body },
        include: { author: { select: { id: true, email: true, displayName: true } } },
      });

      // "تعليق على بطاقة أنا معنيّ بها": the creator, assignees, and (when
      // restricted) the allow-listed members — everyone with a stake in the
      // card, minus whoever just posted the comment.
      const interested = new Set<string>([
        card.createdById,
        ...card.assignees.map((a) => a.userId),
        ...(card.isRestricted ? card.members.map((m) => m.userId) : []),
      ]);
      for (const recipientId of interested) {
        await this.notifications.notify(tx, {
          userId: recipientId,
          actorId: userId,
          type: "COMMENT",
          cardId,
          boardId: card.boardId,
          payload: { cardTitle: card.title },
        });
      }

      return created;
    });

    return serialize(comment);
  }

  async remove(userId: string, cardId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.cardId !== cardId) throw new NotFoundException("Comment not found");
    if (comment.authorId !== userId) {
      throw new ForbiddenException("Only the comment's author can delete it");
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
  }
}
