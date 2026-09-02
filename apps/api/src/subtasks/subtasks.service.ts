import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSubtaskRequest, UpdateAssigneesRequest, UpdateSubtaskRequest } from "@app/types";
import { generateKeyBetween } from "@app/ordering";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard } from "../boards/boards.service";

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  /**
   * Load the parent card and assert the user may access it. Subtasks inherit
   * the parent card's access: any board member who can open the card may manage
   * its subtasks — so authorization routes through `assertMembership` + the same
   * `canAccessCard` predicate used for the card itself, never a bespoke check.
   */
  private async assertCardAccess(userId: string, cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { members: { select: { userId: true } } },
    });
    if (!card) throw new NotFoundException("Card not found");
    await this.boards.assertMembership(userId, card.boardId);
    const board = await this.prisma.board.findUnique({
      where: { id: card.boardId },
      select: { ownerId: true },
    });
    if (!board) throw new NotFoundException("Board not found");
    if (!canAccessCard(userId, board.ownerId, card)) throw new NotFoundException("Card not found");
    return card;
  }

  private async loadSubtask(subtaskId: string) {
    const subtask = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { assignees: { select: { userId: true } } },
    });
    if (!subtask) throw new NotFoundException("Subtask not found");
    return subtask;
  }

  async list(userId: string, cardId: string) {
    await this.assertCardAccess(userId, cardId);
    const subtasks = await this.prisma.subtask.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
      include: { assignees: { select: { userId: true } } },
    });
    return subtasks.map(serializeSubtask);
  }

  async create(userId: string, cardId: string, input: CreateSubtaskRequest) {
    const card = await this.assertCardAccess(userId, cardId);
    await this.boards.assertBoardMutable(card.boardId);
    const last = await this.prisma.subtask.findFirst({
      where: { cardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = generateKeyBetween(last?.position ?? null, null);
    const subtask = await this.prisma.subtask.create({
      data: { cardId, title: input.title, position, createdById: userId },
      include: { assignees: { select: { userId: true } } },
    });
    return serializeSubtask(subtask);
  }

  async update(userId: string, subtaskId: string, input: UpdateSubtaskRequest) {
    const subtask = await this.loadSubtask(subtaskId);
    const card = await this.assertCardAccess(userId, subtask.cardId);
    await this.boards.assertBoardMutable(card.boardId);

    if (input.move) {
      await this.validateNeighborsBelongToCard(
        subtask.cardId,
        [input.move.beforeId, input.move.afterId],
        subtaskId,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let position: string | undefined;
      if (input.move) {
        position = await computeMovePosition(input.move.beforeId, input.move.afterId, async (id) => {
          const neighbor = await tx.subtask.findUnique({ where: { id }, select: { position: true } });
          return neighbor?.position ?? null;
        });
      }
      return tx.subtask.update({
        where: { id: subtaskId },
        data: { title: input.title, isDone: input.isDone, position },
        include: { assignees: { select: { userId: true } } },
      });
    });

    return serializeSubtask(updated);
  }

  async remove(userId: string, subtaskId: string) {
    const subtask = await this.loadSubtask(subtaskId);
    await this.assertCardAccess(userId, subtask.cardId);
    await this.prisma.subtask.delete({ where: { id: subtaskId } });
  }

  /** Replace a subtask's assignee set. Every listed user must be a board member. */
  async updateAssignees(userId: string, subtaskId: string, input: UpdateAssigneesRequest) {
    const subtask = await this.loadSubtask(subtaskId);
    const card = await this.assertCardAccess(userId, subtask.cardId);
    await this.boards.assertBoardMutable(card.boardId);

    const userIds = [...new Set(input.userIds)];
    if (userIds.length > 0) {
      const members = await this.prisma.boardMember.findMany({
        where: { boardId: card.boardId, userId: { in: userIds } },
        select: { userId: true },
      });
      if (members.length !== userIds.length) {
        throw new BadRequestException("Every assignee must be a member of the board");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.subtaskAssignee.deleteMany({ where: { subtaskId } });
      if (userIds.length > 0) {
        await tx.subtaskAssignee.createMany({ data: userIds.map((id) => ({ subtaskId, userId: id })) });
      }
      return tx.subtask.findUniqueOrThrow({
        where: { id: subtaskId },
        include: { assignees: { select: { userId: true } } },
      });
    });

    return serializeSubtask(updated);
  }

  private async validateNeighborsBelongToCard(
    cardId: string,
    neighborIds: (string | null | undefined)[],
    excludeSubtaskId: string,
  ) {
    const ids = neighborIds.filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const found = await this.prisma.subtask.findMany({ where: { id: { in: ids }, cardId } });
    if (found.length !== ids.length || found.some((s) => s.id === excludeSubtaskId)) {
      throw new BadRequestException("Invalid move target");
    }
  }
}

function serializeSubtask(subtask: {
  id: string;
  cardId: string;
  title: string;
  isDone: boolean;
  position: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  assignees?: { userId: string }[];
}) {
  return {
    id: subtask.id,
    cardId: subtask.cardId,
    title: subtask.title,
    isDone: subtask.isDone,
    position: subtask.position,
    createdById: subtask.createdById,
    assigneeIds: (subtask.assignees ?? []).map((a) => a.userId),
    createdAt: subtask.createdAt.toISOString(),
    updatedAt: subtask.updatedAt.toISOString(),
  };
}
