import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCardRequest, UpdateCardRequest } from "@app/types";
import { generateKeyBetween } from "@app/ordering";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, serializeCard } from "../boards/boards.service";

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  private async loadCard(cardId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException("Card not found");
    return card;
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
    return serializeCard(card);
  }

  async update(userId: string, cardId: string, input: UpdateCardRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);

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
      });
    });

    return serializeCard(updated);
  }

  async remove(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
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
