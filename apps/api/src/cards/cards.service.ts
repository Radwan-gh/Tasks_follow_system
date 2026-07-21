import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CardActivityType,
  CreateCardRequest,
  CreateChecklistItemRequest,
  UpdateCardRequest,
  UpdateChecklistItemRequest,
} from "@app/types";
import type { Prisma } from "@prisma/client";
import { generateKeyBetween } from "@app/ordering";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, serializeCard, serializeChecklistItem } from "../boards/boards.service";

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
    const card = await this.prisma.$transaction(async (tx) => {
      const created = await tx.card.create({
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

      const result = await tx.card.update({
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

      for (const activity of await this.diffActivities(tx, card, input, targetListId)) {
        await this.recordActivity(tx, cardId, card.boardId, userId, activity);
      }

      return result;
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
    card: { listId: string; title: string; description: string | null; dueDate: Date | null; isArchived: boolean },
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
    await this.boards.assertMembership(userId, card.boardId);

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
    await this.prisma.card.delete({ where: { id: cardId } });
  }

  // -- Checklist items (subtasks on a card) --------------------------------

  private async loadChecklistItem(itemId: string) {
    const item = await this.prisma.checklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("Checklist item not found");
    return item;
  }

  async listChecklist(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const items = await this.prisma.checklistItem.findMany({
      where: { cardId },
      orderBy: { position: "asc" },
    });
    return items.map(serializeChecklistItem);
  }

  async addChecklistItem(userId: string, cardId: string, input: CreateChecklistItemRequest) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);

    const last = await this.prisma.checklistItem.findFirst({
      where: { cardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = generateKeyBetween(last?.position ?? null, null);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklistItem.create({
        data: { cardId, label: input.label, position },
      });
      await this.recordActivity(tx, cardId, card.boardId, userId, {
        type: "CHECKLIST_ITEM_ADDED",
        toValue: input.label,
      });
      return created;
    });
    return serializeChecklistItem(item);
  }

  async updateChecklistItem(userId: string, itemId: string, input: UpdateChecklistItemRequest) {
    const item = await this.loadChecklistItem(itemId);
    const card = await this.loadCard(item.cardId);
    await this.boards.assertMembership(userId, card.boardId);

    if (input.move) {
      await this.validateChecklistNeighbors(item.cardId, [input.move.beforeId, input.move.afterId], itemId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      let position: string | undefined;
      if (input.move) {
        position = await computeMovePosition(input.move.beforeId, input.move.afterId, async (id) => {
          const neighbor = await tx.checklistItem.findUnique({ where: { id }, select: { position: true } });
          return neighbor?.position ?? null;
        });
      }

      // A completion state change stamps who/when; clearing it wipes the stamp.
      const completionData =
        input.isCompleted === undefined || input.isCompleted === item.isCompleted
          ? {}
          : input.isCompleted
            ? { isCompleted: true, completedAt: new Date(), completedById: userId }
            : { isCompleted: false, completedAt: null, completedById: null };

      const result = await tx.checklistItem.update({
        where: { id: itemId },
        data: { label: input.label, position, ...completionData },
      });

      // Renames of a checklist label are minor and not recorded in history;
      // only completion toggles produce an activity entry.
      if (input.isCompleted !== undefined && input.isCompleted !== item.isCompleted) {
        await this.recordActivity(tx, item.cardId, card.boardId, userId, {
          type: input.isCompleted ? "CHECKLIST_ITEM_COMPLETED" : "CHECKLIST_ITEM_UNCOMPLETED",
          toValue: result.label,
        });
      }
      return result;
    });
    return serializeChecklistItem(updated);
  }

  async removeChecklistItem(userId: string, itemId: string) {
    const item = await this.loadChecklistItem(itemId);
    const card = await this.loadCard(item.cardId);
    await this.boards.assertMembership(userId, card.boardId);

    await this.prisma.$transaction(async (tx) => {
      await tx.checklistItem.delete({ where: { id: itemId } });
      await this.recordActivity(tx, item.cardId, card.boardId, userId, {
        type: "CHECKLIST_ITEM_REMOVED",
        fromValue: item.label,
      });
    });
  }

  private async validateChecklistNeighbors(
    cardId: string,
    neighborIds: (string | null | undefined)[],
    excludeItemId: string,
  ) {
    const ids = neighborIds.filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    const found = await this.prisma.checklistItem.findMany({ where: { id: { in: ids }, cardId } });
    if (found.length !== ids.length || found.some((i) => i.id === excludeItemId)) {
      throw new BadRequestException("Invalid checklist move target");
    }
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
