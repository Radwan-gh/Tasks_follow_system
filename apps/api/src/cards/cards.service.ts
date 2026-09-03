import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  RecurrenceRuleSchema,
  type CardActivityType,
  type CreateCardRequest,
  type UpdateAssigneesRequest,
  type UpdateCardAccessRequest,
  type UpdateCardRequest,
} from "@app/types";
import { Prisma, type CardPriority } from "@prisma/client";
import { generateKeyBetween } from "@app/ordering";
import { computeMovePosition } from "../common/util/position.util";
import { nextRecurrenceDate } from "../common/util/recurrence.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard, canManageCard, serializeCard } from "../boards/boards.service";
import { NotificationsService } from "../notifications/notifications.service";

/** Prisma transaction client — the subset of PrismaService usable inside `$transaction`. */
type Tx = Prisma.TransactionClient;

interface ActivityInput {
  type: CardActivityType;
  fromValue?: string | null;
  toValue?: string | null;
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async loadCard(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        members: { select: { userId: true } },
        assignees: { select: { userId: true } },
      },
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

  /**
   * `design-prompt-group-3.md` §3 "توليد المهمة المتكررة": spawns the next
   * instance of a repeating card into the board's «جديد» list when the
   * current instance is moved into «انتهى». Carries forward title,
   * description, priority, assignees, and the same recurrence rule (so the
   * chain continues one-in-one-out — never more than one open instance).
   */
  private async spawnNextRecurrence(
    tx: Tx,
    card: {
      boardId: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      priority: CardPriority;
      recurrence: Prisma.JsonValue;
      createdById: string;
      assignees: { userId: string }[];
    },
  ): Promise<void> {
    const rule = RecurrenceRuleSchema.safeParse(card.recurrence);
    if (!rule.success) return;

    const newList = await tx.list.findFirst({
      where: { boardId: card.boardId, statusCategory: "NEW", isArchived: false },
      orderBy: { position: "asc" },
    });
    if (!newList) return;

    const nextDueDate = nextRecurrenceDate(rule.data, card.dueDate ?? new Date());

    const last = await tx.card.findFirst({
      where: { listId: newList.id, isArchived: false },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = generateKeyBetween(last?.position ?? null, null);

    const created = await tx.card.create({
      data: {
        listId: newList.id,
        boardId: card.boardId,
        title: card.title,
        description: card.description,
        dueDate: nextDueDate,
        priority: card.priority,
        recurrence: card.recurrence as Prisma.InputJsonValue,
        createdById: card.createdById,
        position,
      },
    });
    if (card.assignees.length > 0) {
      await tx.cardAssignee.createMany({
        data: card.assignees.map((a) => ({ cardId: created.id, userId: a.userId })),
      });
    }
    await this.recordActivity(tx, created.id, card.boardId, card.createdById, {
      type: "CREATED",
      toValue: newList.name,
    });
  }

  async create(userId: string, listId: string, input: CreateCardRequest) {
    const list = await this.loadList(listId);
    await this.boards.assertMembership(userId, list.boardId);
    await this.boards.assertBoardMutable(list.boardId);

    const position = await this.nextCardPosition(listId);
    const card = await this.prisma.$transaction(async (tx) => {
      const created = await tx.card.create({
        data: {
          listId,
          boardId: list.boardId,
          title: input.title,
          description: input.description ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          dueDateHasTime: input.dueDateHasTime ?? false,
          priority: input.priority,
          costAmount: input.costAmount ?? undefined,
          costNote: input.costNote ?? null,
          recurrence: input.recurrence ?? undefined,
          position,
          createdById: userId,
        },
      });
      // First history entry: who added the card and its initial status (list).
      await this.recordActivity(tx, created.id, created.boardId, userId, {
        type: "CREATED",
        toValue: list.name,
      });
      return created;
    });
    return serializeCard(card);
  }

  async getDetail(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId, "VIEWER");
    const ownerId = await this.boardOwnerId(card.boardId);
    // Hide existence of restricted cards from members without access.
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");
    return serializeCard(card);
  }

  async update(userId: string, cardId: string, input: UpdateCardRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    await this.boards.assertBoardMutable(card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const targetListId = input.targetListId ?? card.listId;
    const isMovingLists = targetListId !== card.listId;
    let targetList: Awaited<ReturnType<typeof this.loadList>> | null = null;
    if (isMovingLists) {
      targetList = await this.loadList(targetListId);
      if (targetList.boardId !== card.boardId) {
        throw new BadRequestException("Cannot move a card to a list on a different board");
      }
      // §3b-4 "تعديل لقرار سابق": moving *into* «انتهى» (CLOSED) is restricted
      // to the board owner and this card's own assignees — every other move
      // stays open to any board member.
      if (targetList.statusCategory === "CLOSED") {
        const isAssignee = card.assignees.some((a) => a.userId === userId);
        if (ownerId !== userId && !isAssignee) {
          throw new ForbiddenException(
            'Only the board owner or this task\'s assignees can move it to "انتهى"',
          );
        }
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

      const result = await tx.card.update({
        where: { id: cardId },
        data: {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
          dueDateHasTime: input.dueDateHasTime,
          isArchived: input.isArchived,
          priority: input.priority,
          costAmount: input.costAmount === undefined ? undefined : input.costAmount,
          costNote: input.costNote,
          recurrence: input.recurrence === undefined ? undefined : (input.recurrence ?? Prisma.JsonNull),
          listId: targetListId,
          position,
        },
        include: {
          members: { select: { userId: true } },
          assignees: { select: { userId: true } },
        },
      });

      for (const activity of await this.diffActivities(tx, card, input, targetListId)) {
        await this.recordActivity(tx, cardId, card.boardId, userId, activity);
      }

      // Moving into «انتهى»: notify the creator (design-prompt-group-3.md's
      // "نقل بطاقة أنشأتها إلى انتهى") and, if this card repeats, spawn the
      // next instance in the board's «جديد» list — see §3 "توليد المهمة المتكررة".
      if (isMovingLists && targetList?.statusCategory === "CLOSED") {
        await this.notifications.notify(tx, {
          userId: card.createdById,
          actorId: userId,
          type: "CARD_CLOSED",
          cardId,
          boardId: card.boardId,
          payload: { cardTitle: result.title },
        });

        if (card.recurrence) {
          await this.spawnNextRecurrence(tx, card);
        }
      }

      return result;
    });

    return serializeCard(updated);
  }

  /** Replace a card's access config. Manageable only by the board owner or card creator. */
  async updateAccess(userId: string, cardId: string, input: UpdateCardAccessRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    await this.boards.assertBoardMutable(card.boardId);
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
        include: {
          members: { select: { userId: true } },
          assignees: { select: { userId: true } },
        },
      });
    });

    return serializeCard(updated);
  }

  /**
   * Replace a card's assignee set (several board members allowed). Any board
   * member with access to the card may (re)assign it. Every listed user must be
   * a member of the card's board. Records an ASSIGNED/UNASSIGNED activity — with
   * a snapshot of the new assignees' names — only when the set actually changes.
   */
  async updateAssignees(userId: string, cardId: string, input: UpdateAssigneesRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    await this.boards.assertBoardMutable(card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const userIds = [...new Set(input.userIds)];
    // §3c-4 "منتقي المسؤولين لا يعرض المشاهدين": a VIEWER is a board member
    // but never a valid assignee, so the `role: not VIEWER` filter here is
    // what makes assigning one fail the same length check as a non-member.
    const boardMembers = userIds.length
      ? await this.prisma.boardMember.findMany({
          where: { boardId: card.boardId, userId: { in: userIds }, role: { not: "VIEWER" } },
          select: { userId: true, user: { select: { displayName: true } } },
        })
      : [];
    if (boardMembers.length !== userIds.length) {
      throw new BadRequestException("Every assignee must be a member of the board");
    }

    const before = new Set(card.assignees.map((a) => a.userId));
    const changed = before.size !== userIds.length || userIds.some((id) => !before.has(id));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.cardAssignee.deleteMany({ where: { cardId } });
      if (userIds.length > 0) {
        await tx.cardAssignee.createMany({ data: userIds.map((id) => ({ cardId, userId: id })) });
      }
      if (changed) {
        await this.recordActivity(
          tx,
          cardId,
          card.boardId,
          userId,
          userIds.length > 0
            ? { type: "ASSIGNED", toValue: boardMembers.map((m) => m.user.displayName).join("، ") }
            : { type: "UNASSIGNED" },
        );
        // Only the newly-added assignees, not everyone still on the card —
        // being re-saved with the same assignee list shouldn't re-notify them.
        for (const addedUserId of userIds.filter((id) => !before.has(id))) {
          await this.notifications.notify(tx, {
            userId: addedUserId,
            actorId: userId,
            type: "ASSIGNED",
            cardId,
            boardId: card.boardId,
            payload: { cardTitle: card.title },
          });
        }
      }
      return tx.card.findUniqueOrThrow({
        where: { id: cardId },
        include: {
          members: { select: { userId: true } },
          assignees: { select: { userId: true } },
        },
      });
    });

    return serializeCard(updated);
  }

  /**
   * Diff the incoming update against the card's current state and return the
   * history events it produces. A change of list is the card's "status change".
   * Called inside the update transaction so history and the mutation commit
   * atomically. Field-level diffs only fire when a value is actually provided
   * *and* different, so a no-op PATCH records nothing.
   */
  private async diffActivities(
    tx: Tx,
    card: {
      listId: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      isArchived: boolean;
      costAmount: Prisma.Decimal | null;
    },
    input: UpdateCardRequest,
    targetListId: string,
  ): Promise<ActivityInput[]> {
    const activities: ActivityInput[] = [];

    if (targetListId !== card.listId) {
      const [fromList, toList] = await Promise.all([
        tx.list.findUnique({ where: { id: card.listId }, select: { name: true } }),
        tx.list.findUnique({ where: { id: targetListId }, select: { name: true } }),
      ]);
      activities.push({ type: "MOVED", fromValue: fromList?.name ?? null, toValue: toList?.name ?? null });
    }

    if (input.title !== undefined && input.title !== card.title) {
      activities.push({ type: "RENAMED", fromValue: card.title, toValue: input.title });
    }

    if (input.description !== undefined && (input.description ?? null) !== card.description) {
      // Descriptions can be long; record only that it changed, not the full text.
      activities.push({ type: "DESCRIPTION_UPDATED" });
    }

    if (input.dueDate !== undefined) {
      const nextDue = input.dueDate ? new Date(input.dueDate).toISOString() : null;
      const prevDue = card.dueDate ? card.dueDate.toISOString() : null;
      if (nextDue !== prevDue) {
        activities.push({ type: "DUE_DATE_CHANGED", fromValue: prevDue, toValue: nextDue });
      }
    }

    if (input.isArchived !== undefined && input.isArchived !== card.isArchived) {
      activities.push({ type: input.isArchived ? "ARCHIVED" : "UNARCHIVED" });
    }

    if (input.costAmount !== undefined) {
      const prevCost = card.costAmount ? card.costAmount.toString() : null;
      if (input.costAmount !== prevCost) {
        activities.push({ type: "COST_UPDATED", fromValue: prevCost, toValue: input.costAmount });
      }
    }

    return activities;
  }

  private recordActivity(
    tx: Tx,
    cardId: string,
    boardId: string,
    actorId: string,
    activity: ActivityInput,
  ) {
    return tx.cardActivity.create({
      data: {
        cardId,
        boardId,
        actorId,
        type: activity.type,
        fromValue: activity.fromValue ?? null,
        toValue: activity.toValue ?? null,
      },
    });
  }

  async getHistory(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId, "VIEWER");
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const activities = await this.prisma.cardActivity.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { id: true, email: true, displayName: true } } },
    });
    return activities.map(serializeCardActivity);
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

function serializeCardActivity(activity: {
  id: string;
  cardId: string;
  type: CardActivityType;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
  actor: { id: string; email: string; displayName: string };
}) {
  return {
    id: activity.id,
    cardId: activity.cardId,
    type: activity.type,
    fromValue: activity.fromValue,
    toValue: activity.toValue,
    createdAt: activity.createdAt.toISOString(),
    actor: activity.actor,
  };
}
