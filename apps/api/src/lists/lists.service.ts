import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateListRequest, UpdateListRequest } from "@app/types";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService } from "../boards/boards.service";

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  private async loadList(listId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundException("List not found");
    return list;
  }

  async create(userId: string, boardId: string, input: CreateListRequest) {
    await this.boards.assertMembership(userId, boardId);

    const position = await this.boards.nextListPosition(boardId);
    const list = await this.prisma.list.create({
      data: { boardId, name: input.name, position },
    });
    return serializeList(list);
  }

  async update(userId: string, listId: string, input: UpdateListRequest) {
    const list = await this.loadList(listId);
    await this.boards.assertMembership(userId, list.boardId);

    if (input.move) {
      const { beforeId, afterId } = input.move;
      await this.validateNeighborsBelongToBoard(list.boardId, [beforeId, afterId], listId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let position: string | undefined;
      if (input.move) {
        position = await computeMovePosition(input.move.beforeId, input.move.afterId, async (id) => {
          const neighbor = await tx.list.findUnique({ where: { id }, select: { position: true } });
          return neighbor?.position ?? null;
        });
      }
      return tx.list.update({
        where: { id: listId },
        data: { name: input.name, isArchived: input.isArchived, position },
      });
    });

    return serializeList(updated);
  }

  async remove(userId: string, listId: string) {
    const list = await this.loadList(listId);
    await this.boards.assertMembership(userId, list.boardId);
    await this.prisma.list.delete({ where: { id: listId } });
  }

  private async validateNeighborsBelongToBoard(
    boardId: string,
    neighborIds: (string | null | undefined)[],
    excludeListId: string,
  ) {
    const ids = neighborIds.filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const found = await this.prisma.list.findMany({ where: { id: { in: ids }, boardId } });
    if (found.length !== ids.length || found.some((l) => l.id === excludeListId)) {
      throw new BadRequestException("Invalid move target");
    }
  }
}

function serializeList(list: {
  id: string;
  boardId: string;
  name: string;
  position: string;
  isArchived: boolean;
  createdAt: Date;
}) {
  return {
    id: list.id,
    boardId: list.boardId,
    name: list.name,
    position: list.position,
    isArchived: list.isArchived,
    createdAt: list.createdAt.toISOString(),
    cards: [] as never[],
  };
}
