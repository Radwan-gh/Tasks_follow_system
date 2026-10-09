import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { canManageCard, type BoardsService } from "../boards/boards.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SubtasksService } from "../subtasks/subtasks.service";
import { CardsService } from "./cards.service";

const BOARD_OWNER = "u-board-owner";
const CREATOR = "u-creator";
const MEMBER = "u-member";

/** Just enough of Prisma for a card on an open board, kept in memory. */
function setup() {
  const card = {
    id: "card-1",
    listId: "list-new",
    boardId: "board-1",
    title: "تجهيز العرض",
    description: null,
    dueDate: null,
    dueDateHasTime: false,
    isArchived: false,
    isRestricted: false,
    priority: "NORMAL",
    costAmount: null,
    costNote: null,
    recurrence: null,
    position: "a0",
    createdById: CREATOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [],
    assignees: [],
  };
  const subtask = {
    id: "st-1",
    cardId: card.id,
    title: "حجز القاعة",
    isDone: false,
    position: "a0",
    createdById: CREATOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignees: [],
  };
  const lists: Record<string, { id: string; boardId: string; name: string; statusCategory: string }> = {
    "list-new": { id: "list-new", boardId: card.boardId, name: "جديد", statusCategory: "NEW" },
    "list-doing": { id: "list-doing", boardId: card.boardId, name: "قيد التنفيذ", statusCategory: "IN_PROGRESS" },
  };
  const writes: string[] = [];
  const db = {
    card: {
      findUnique: async () => card,
      findFirst: async () => null,
      findUniqueOrThrow: async () => card,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push("card.update");
        return { ...card, ...data };
      },
      delete: async () => {
        writes.push("card.delete");
      },
    },
    board: { findUnique: async () => ({ ownerId: BOARD_OWNER }) },
    list: { findUnique: async ({ where }: { where: { id: string } }) => lists[where.id] ?? null },
    boardMember: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
        where.userId.in.map((userId) => ({ userId, user: { displayName: userId, isActive: true } })),
    },
    cardActivity: { create: async () => undefined },
    cardAssignee: { deleteMany: async () => undefined, createMany: async () => undefined },
    subtask: {
      findUnique: async () => subtask,
      findFirst: async () => null,
      create: async () => {
        writes.push("subtask.create");
        return subtask;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push("subtask.update");
        return { ...subtask, ...data };
      },
      delete: async () => {
        writes.push("subtask.delete");
      },
    },
    subtaskAssignee: { deleteMany: async () => undefined, createMany: async () => undefined },
  };
  const prisma = { ...db, $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db) } as unknown as PrismaService;
  const boards = {
    assertMembership: async () => ({ role: "MEMBER", supervised: false }),
    assertBoardMutable: async () => undefined,
    // Same rule as the real method, against the in-memory board.
    assertCanManageCard: async (userId: string, c: { createdById: string }) => {
      if (!canManageCard(userId, BOARD_OWNER, c)) throw new ForbiddenException();
    },
  } as unknown as BoardsService;
  const notifications = { notify: async () => undefined } as unknown as NotificationsService;

  return {
    cards: new CardsService(prisma, boards, notifications),
    subtasks: new SubtasksService(prisma, boards),
    writes,
  };
}

describe("task ownership", () => {
  it("lets only the board owner or the task creator edit task details", async () => {
    for (const owner of [BOARD_OWNER, CREATOR]) {
      const { cards, writes } = setup();
      await cards.update(owner, "card-1", { title: "عنوان جديد", priority: "URGENT" });
      expect(writes).toEqual(["card.update"]);
    }
    const { cards, writes } = setup();
    await expect(cards.update(MEMBER, "card-1", { title: "عنوان جديد" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(cards.update(MEMBER, "card-1", { isArchived: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes).toEqual([]);
  });

  it("still lets any member move the task to another status", async () => {
    const { cards, writes } = setup();
    await cards.update(MEMBER, "card-1", { targetListId: "list-doing" });
    expect(writes).toEqual(["card.update"]);
  });

  it("refuses a move that smuggles a detail edit along", async () => {
    const { cards, writes } = setup();
    await expect(
      cards.update(MEMBER, "card-1", { targetListId: "list-doing", dueDate: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes).toEqual([]);
  });

  it("keeps assigning and deleting the task to its owner", async () => {
    const { cards, writes } = setup();
    await expect(cards.updateAssignees(MEMBER, "card-1", { userIds: [MEMBER] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(cards.remove(MEMBER, "card-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes).toEqual([]);
    await cards.remove(CREATOR, "card-1");
    expect(writes).toEqual(["card.delete"]);
  });

  it("lets any member tick a sub-task, but only the owner add, rename, reorder, assign or delete one", async () => {
    const { subtasks, writes } = setup();
    await subtasks.update(MEMBER, "st-1", { isDone: true });
    expect(writes).toEqual(["subtask.update"]);

    const refused = [
      subtasks.create(MEMBER, "card-1", { title: "بند جديد" }),
      subtasks.update(MEMBER, "st-1", { title: "اسم آخر" }),
      subtasks.update(MEMBER, "st-1", { isDone: true, move: { beforeId: null, afterId: null } }),
      subtasks.updateAssignees(MEMBER, "st-1", { userIds: [MEMBER] }),
      subtasks.remove(MEMBER, "st-1"),
    ];
    for (const attempt of refused) await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    expect(writes).toEqual(["subtask.update"]);

    await subtasks.create(CREATOR, "card-1", { title: "بند جديد" });
    expect(writes).toEqual(["subtask.update", "subtask.create"]);
  });
});
