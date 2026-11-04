import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BoardRole,
  CardActivityType,
  CreateSubtaskRequest,
  UpdateAssigneesRequest,
  UpdateSubtaskRequest,
} from "@app/types";
import { generateKeyBetween } from "@app/ordering";
import type { Prisma } from "@prisma/client";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService } from "../boards/boards.service";
import { NotificationsService } from "../notifications/notifications.service";

type Tx = Prisma.TransactionClient;

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Assert the user may reach the parent card. Subtasks inherit the parent
   * card's access: any member of one of its boards who can open the card may
   * tick its subtasks — so authorization routes through
   * `BoardsService.assertCardAccess`, the same check as the card itself, never
   * a bespoke one (a supervisor, only ever admitted on a `VIEWER` read, sees
   * restricted cards too). Every write needs a live board. Adding, renaming,
   * reordering, assigning or deleting one edits the task's details, so those
   * also go through `BoardsService.assertCanManageCard`.
   */
  private assertCardAccess(userId: string, cardId: string, minRole: BoardRole = "MEMBER") {
    return this.boards.assertCardAccess(userId, cardId, minRole, { mutable: minRole !== "VIEWER" });
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
    await this.assertCardAccess(userId, cardId, "VIEWER");
    const subtasks = await this.prisma.subtask.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
      include: { assignees: { select: { userId: true } } },
    });
    return subtasks.map(serializeSubtask);
  }

  async create(userId: string, cardId: string, input: CreateSubtaskRequest) {
    const access = await this.assertCardAccess(userId, cardId);
    this.boards.assertCanManageCard(userId, access);
    const last = await this.prisma.subtask.findFirst({
      where: { cardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = generateKeyBetween(last?.position ?? null, null);
    const subtask = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subtask.create({
        data: { cardId, title: input.title, position, createdById: userId },
        include: { assignees: { select: { userId: true } } },
      });
      await recordActivity(tx, access.card, userId, "SUBTASK_ADDED", null, created.title);
      return created;
    });
    return serializeSubtask(subtask);
  }

  async update(userId: string, subtaskId: string, input: UpdateSubtaskRequest) {
    const subtask = await this.loadSubtask(subtaskId);
    const access = await this.assertCardAccess(userId, subtask.cardId);
    const { card } = access;
    // Ticking (`isDone`) is open to everyone with access; renaming or reordering is the owner's.
    if (input.title !== undefined || input.move !== undefined) {
      this.boards.assertCanManageCard(userId, access);
    }

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
      const result = await tx.subtask.update({
        where: { id: subtaskId },
        data: { title: input.title, isDone: input.isDone, position },
        include: { assignees: { select: { userId: true } } },
      });

      if (input.title !== undefined && result.title !== subtask.title) {
        await recordActivity(tx, card, userId, "SUBTASK_RENAMED", subtask.title, result.title);
      }
      if (input.isDone !== undefined && input.isDone !== subtask.isDone) {
        const type = input.isDone ? "SUBTASK_COMPLETED" : "SUBTASK_REOPENED";
        await recordActivity(tx, card, userId, type, null, result.title);
      }

      // Ticking it off (not re-saving an already-done one, not unticking):
      // tell everyone with a stake in it — the parent card's creator and
      // assignees, plus whoever created or is assigned to this subtask.
      // `notify` drops the actor themself.
      if (input.isDone === true && !subtask.isDone) {
        const interested = new Set<string>([
          card.createdById,
          ...card.assignees.map((a) => a.userId),
          subtask.createdById,
          ...subtask.assignees.map((a) => a.userId),
        ]);
        for (const recipientId of interested) {
          await this.notifications.notify(tx, {
            userId: recipientId,
            actorId: userId,
            type: "SUBTASK_COMPLETED",
            cardId: card.id,
            boardId: card.boardId,
            boardIds: access.boardIds,
            payload: { cardTitle: card.title, subtaskTitle: result.title },
          });
        }
      }

      return result;
    });

    return serializeSubtask(updated);
  }

  async remove(userId: string, subtaskId: string) {
    const subtask = await this.loadSubtask(subtaskId);
    const access = await this.assertCardAccess(userId, subtask.cardId);
    this.boards.assertCanManageCard(userId, access);
    await this.prisma.$transaction(async (tx) => {
      await tx.subtask.delete({ where: { id: subtaskId } });
      await recordActivity(tx, access.card, userId, "SUBTASK_DELETED", subtask.title, null);
    });
  }

  /**
   * Replace a subtask's assignee set. Every listed user must be a member of one
   * of the task's boards, and every *newly* added one must be an active account
   * — same rules as `CardsService.updateAssignees`, including that only the
   * task's owner assigns. Records a `SUBTASK_ASSIGNED` activity only when the
   * set actually changes.
   */
  async updateAssignees(userId: string, subtaskId: string, input: UpdateAssigneesRequest) {
    const subtask = await this.loadSubtask(subtaskId);
    const access = await this.assertCardAccess(userId, subtask.cardId);
    const { card } = access;
    this.boards.assertCanManageCard(userId, access);

    const userIds = [...new Set(input.userIds)];
    const before = new Set(subtask.assignees.map((a) => a.userId));
    let members: Awaited<ReturnType<BoardsService["cardPeople"]>> = [];
    if (userIds.length > 0) {
      // §3c-4: viewers never appear in the assignee picker — see `CardsService.updateAssignees`.
      members = (await this.boards.cardPeople(access.boardIds, userIds)).filter((m) => m.role !== "VIEWER");
      if (members.length !== userIds.length) {
        throw new BadRequestException("Every assignee must be a member of one of the task's boards");
      }
      // Already-assigned people survive a later deactivation; only additions
      // have to be active accounts.
      if (members.some((m) => !m.user.isActive && !before.has(m.userId))) {
        throw new BadRequestException("Cannot assign a deactivated user");
      }
    }

    const changed = before.size !== userIds.length || userIds.some((id) => !before.has(id));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.subtaskAssignee.deleteMany({ where: { subtaskId } });
      if (userIds.length > 0) {
        await tx.subtaskAssignee.createMany({ data: userIds.map((id) => ({ subtaskId, userId: id })) });
      }
      if (changed) {
        const names = members.map((m) => m.user.displayName).join("، ");
        await recordActivity(tx, card, userId, "SUBTASK_ASSIGNED", subtask.title, names || null);
      }
      // Only the newly-added assignees — same rule as `CardsService.updateAssignees`.
      for (const addedUserId of userIds.filter((id) => !before.has(id))) {
        await this.notifications.notify(tx, {
          userId: addedUserId,
          actorId: userId,
          type: "SUBTASK_ASSIGNED",
          cardId: card.id,
          boardId: card.boardId,
          boardIds: access.boardIds,
          payload: { cardTitle: card.title, subtaskTitle: subtask.title },
        });
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

/**
 * A subtask change goes into its parent card's history, in the same
 * transaction as the change itself — the card's own log is where both apps and
 * `get_card_history` read it. Keyed to the card's home board, like
 * `CardsService.recordActivity`. The title is snapshotted so the entry still
 * reads correctly after a later rename or delete.
 */
function recordActivity(
  tx: Tx,
  card: { id: string; boardId: string },
  actorId: string,
  type: CardActivityType,
  fromValue: string | null,
  toValue: string | null,
) {
  return tx.cardActivity.create({
    data: { cardId: card.id, boardId: card.boardId, actorId, type, fromValue, toValue },
  });
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
