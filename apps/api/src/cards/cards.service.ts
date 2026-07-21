import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCardRequest, UpdateCardAccessRequest, UpdateCardRequest } from "@app/types";
import { generateKeyBetween } from "@app/ordering";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard, canManageCard, serializeCard } from "../boards/boards.service";

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  private async loadCard(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { members: { select: { userId: true } } },
    });
    if (!card) throw new NotFoundException("Card not found");
    return card;
  }

  /** The board's owner id, used for the card access/manage predicates. */
  private async boardOwnerId(boardId: string): Promise<string> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId }, select: { ownerId: true } });
    if (!board) throw new NotFoundException("Board not found");
    return board.ownerId;
  }

  private async loadList(listId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundException("List not found");
    return list;
  }

  private async nextCardPosition(listId: string): Promise<string> {
    const last = await this.prisma.card.findFirst({
      where: { listId, isArchived: false },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return generateKeyBetween(last?.position ?? null, null);
  }

  async create(userId: string, listId: string, input: CreateCardRequest) {
    const list = await this.loadList(listId);
    await this.boards.assertMembership(userId, list.boardId);

    const position = await this.nextCardPosition(listId);
    const card = await this.prisma.card.create({
      data: {
        listId,
        boardId: list.boardId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        position,
        createdById: userId,
      },
    });
    return serializeCard(card);
  }

  async getDetail(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    // Hide existence of restricted cards from members without access.
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");
    return serializeCard(card);
  }

  async update(userId: string, cardId: string, input: UpdateCardRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const targetListId = input.targetListId ?? card.listId;
    if (targetListId !== card.listId) {
      const targetList = await this.loadList(targetListId);
      if (targetList.boardId !== card.boardId) {
        throw new BadRequestException("Cannot move a card to a list on a different board");
      }
    }
    if (input.move) {
      await this.validateNeighborsBelongToList(targetListId, [input.move.beforeId, input.move.afterId], cardId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let position: string | undefined;
      if (input.move) {
        position = await computeMovePosition(input.move.beforeId, input.move.afterId, async (id) => {
          const neighbor = await tx.card.findUnique({ where: { id }, select: { position: true } });
          return neighbor?.position ?? null;
        });
      } else if (targetListId !== card.listId) {
        // Moved to a different list with no explicit neighbors given: append to the end.
        const last = await tx.card.findFirst({
          where: { listId: targetListId, isArchived: false },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        position = generateKeyBetween(last?.position ?? null, null);
      }

      return tx.card.update({
        where: { id: cardId },
        data: {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
          isArchived: input.isArchived,
          listId: targetListId,
          position,
        },
        include: { members: { select: { userId: true } } },
      });
    });

    return serializeCard(updated);
  }

  /** Replace a card's access config. Manageable only by the board owner or card creator. */
  async updateAccess(userId: string, cardId: string, input: UpdateCardAccessRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canManageCard(userId, ownerId, card)) {
      throw new ForbiddenException("Only the board owner or the task creator can change task access");
    }

    const memberUserIds = input.isRestricted ? [...new Set(input.memberUserIds)] : [];
    if (memberUserIds.length > 0) {
      // Every listed user must currently be a member of the card's board.
      const boardMembers = await this.prisma.boardMember.findMany({
        where: { boardId: card.boardId, userId: { in: memberUserIds } },
        select: { userId: true },
      });
      if (boardMembers.length !== memberUserIds.length) {
        throw new BadRequestException("Every task member must be a member of the board");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.cardMember.deleteMany({ where: { cardId } });
      if (memberUserIds.length > 0) {
        await tx.cardMember.createMany({ data: memberUserIds.map((id) => ({ cardId, userId: id })) });
      }
      return tx.card.update({
        where: { id: cardId },
        data: { isRestricted: input.isRestricted },
        include: { members: { select: { userId: true } } },
      });
    });

    return serializeCard(updated);
  }

  async remove(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");
    await this.prisma.card.delete({ where: { id: cardId } });
  }

  private async validateNeighborsBelongToList(
    listId: string,
    neighborIds: (string | null | undefined)[],
    excludeCardId: string,
  ) {
    const ids = neighborIds.filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const found = await this.prisma.card.findMany({ where: { id: { in: ids }, listId } });
    if (found.length !== ids.length || found.some((c) => c.id === excludeCardId)) {
      throw new BadRequestException("Invalid move target");
    }
  }
}
