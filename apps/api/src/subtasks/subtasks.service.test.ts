import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { canManageCard, type BoardsService } from "../boards/boards.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SubtasksService } from "./subtasks.service";

const CREATOR = "u-creator";
const CARD_ASSIGNEE = "u-card-assignee";
const ACTOR = "u-actor";
const NEWBIE = "u-newbie";

interface Logged {
  type: string;
  actorId: string;
  fromValue: string | null;
  toValue: string | null;
}

interface Sent {
  userId: string;
  actorId: string;
  type: string;
  payload?: Record<string, unknown>;
}

/** Just enough of Prisma for subtask add/rename/tick/assign/delete, kept in memory. */
function setup(subtaskOverrides: { isDone?: boolean; assigneeIds?: string[] } = {}) {
  const card = {
    id: "card-1",
    boardId: "board-1",
    title: "تجهيز العرض",
    createdById: CREATOR,
    isRestricted: false,
    members: [],
    assignees: [{ userId: CARD_ASSIGNEE }],
    boardLinks: [],
  };
  const subtask = {
    id: "st-1",
    cardId: card.id,
    title: "حجز القاعة",
    isDone: subtaskOverrides.isDone ?? false,
    position: "a0",
    createdById: CREATOR,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignees: (subtaskOverrides.assigneeIds ?? []).map((userId) => ({ userId })),
  };
  const subtaskModel = {
    // Fresh snapshots, like real Prisma — the service compares the loaded row against the update.
    findUnique: async () => ({ ...subtask, assignees: [...subtask.assignees] }),
    findUniqueOrThrow: async () => ({ ...subtask, assignees: [...subtask.assignees] }),
    findFirst: async () => ({ position: subtask.position }),
    create: async ({ data }: { data: { title: string; position: string; createdById: string } }) => ({
      ...subtask,
      ...data,
      id: "st-2",
      isDone: false,
      assignees: [],
    }),
    update: async ({ data }: { data: { title?: string; isDone?: boolean } }) => {
      if (data.title !== undefined) subtask.title = data.title;
      if (data.isDone !== undefined) subtask.isDone = data.isDone;
      return { ...subtask };
    },
    delete: async () => ({ ...subtask }),
  };
  const subtaskAssignee = {
    deleteMany: async () => {
      subtask.assignees = [];
    },
    createMany: async ({ data }: { data: { userId: string }[] }) => {
      subtask.assignees = data.map((d) => ({ userId: d.userId }));
    },
  };
  const logged: Logged[] = [];
  const cardActivity = {
    create: async ({ data }: { data: Logged }) => {
      logged.push({ type: data.type, actorId: data.actorId, fromValue: data.fromValue, toValue: data.toValue });
    },
  };
  const tx = { subtask: subtaskModel, subtaskAssignee, cardActivity };
  const prisma = {
    ...tx,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;
  // The card's only board is owned by its creator.
  const access = { role: "MEMBER", supervised: false, card, boardIds: [card.boardId], ownerIds: [CREATOR] };
  const boards = {
    assertCardAccess: async () => access,
    // Same rule as the real method: assigning and renaming are the task owner's (here, its creator).
    assertCanManageCard: (userId: string, a: typeof access) => {
      if (!canManageCard(userId, a.ownerIds, a.card)) throw new ForbiddenException();
    },
    cardPeople: async (_boardIds: string[], userIds: string[]) =>
      userIds.map((userId) => ({ userId, role: "MEMBER", user: { isActive: true, displayName: `name:${userId}` } })),
  } as unknown as BoardsService;

  const sent: Sent[] = [];
  // Mirrors the real `notify`'s own-action guard so the test asserts on what would actually be written.
  const notifications = {
    notify: async (_tx: unknown, input: Sent) => {
      if (input.userId !== input.actorId) sent.push(input);
    },
  } as unknown as NotificationsService;

  return { service: new SubtasksService(prisma, boards, notifications), sent, logged };
}

describe("SubtasksService notifications", () => {
  it("notifies only newly-added subtask assignees", async () => {
    const { service, sent } = setup({ assigneeIds: [CARD_ASSIGNEE] });
    await service.updateAssignees(CREATOR, "st-1", { userIds: [CARD_ASSIGNEE, NEWBIE] });
    expect(sent).toEqual([
      expect.objectContaining({
        userId: NEWBIE,
        type: "SUBTASK_ASSIGNED",
        payload: { cardTitle: "تجهيز العرض", subtaskTitle: "حجز القاعة" },
      }),
    ]);
  });

  it("does not notify someone who assigns a subtask to themself", async () => {
    const { service, sent } = setup();
    await service.updateAssignees(CREATOR, "st-1", { userIds: [CREATOR] });
    expect(sent).toEqual([]);
  });

  it("notifies the card's creator, card assignees and subtask assignees when ticked off", async () => {
    const { service, sent } = setup({ assigneeIds: [NEWBIE] });
    await service.update(ACTOR, "st-1", { isDone: true });
    expect(sent.map((n) => n.type)).toEqual(["SUBTASK_COMPLETED", "SUBTASK_COMPLETED", "SUBTASK_COMPLETED"]);
    expect(sent.map((n) => n.userId).sort()).toEqual([CARD_ASSIGNEE, CREATOR, NEWBIE].sort());
  });

  it("never notifies the person who ticked it", async () => {
    const { service, sent } = setup({ assigneeIds: [ACTOR] });
    await service.update(ACTOR, "st-1", { isDone: true });
    expect(sent.map((n) => n.userId)).not.toContain(ACTOR);
  });

  it("stays quiet on unticking, re-saving a done subtask, or a rename", async () => {
    const untick = setup({ isDone: true });
    await untick.service.update(ACTOR, "st-1", { isDone: false });
    const resave = setup({ isDone: true });
    await resave.service.update(ACTOR, "st-1", { isDone: true });
    const rename = setup();
    await rename.service.update(CREATOR, "st-1", { title: "حجز قاعة أكبر" });
    expect([...untick.sent, ...resave.sent, ...rename.sent]).toEqual([]);
  });
});

describe("SubtasksService history", () => {
  it("logs adding a subtask with its title", async () => {
    const { service, logged } = setup();
    await service.create(CREATOR, "card-1", { title: "طباعة الدعوات" });
    expect(logged).toEqual([{ type: "SUBTASK_ADDED", actorId: CREATOR, fromValue: null, toValue: "طباعة الدعوات" }]);
  });

  it("logs ticking and unticking", async () => {
    const tick = setup();
    await tick.service.update(ACTOR, "st-1", { isDone: true });
    const untick = setup({ isDone: true });
    await untick.service.update(ACTOR, "st-1", { isDone: false });
    expect([...tick.logged, ...untick.logged]).toEqual([
      { type: "SUBTASK_COMPLETED", actorId: ACTOR, fromValue: null, toValue: "حجز القاعة" },
      { type: "SUBTASK_REOPENED", actorId: ACTOR, fromValue: null, toValue: "حجز القاعة" },
    ]);
  });

  it("logs a rename with the old and new titles", async () => {
    const { service, logged } = setup();
    await service.update(CREATOR, "st-1", { title: "حجز قاعة أكبر" });
    expect(logged).toEqual([
      { type: "SUBTASK_RENAMED", actorId: CREATOR, fromValue: "حجز القاعة", toValue: "حجز قاعة أكبر" },
    ]);
  });

  it("logs nothing when nothing changes", async () => {
    const resave = setup({ isDone: true });
    await resave.service.update(ACTOR, "st-1", { isDone: true });
    const sameTitle = setup();
    await sameTitle.service.update(CREATOR, "st-1", { title: "حجز القاعة" });
    const sameAssignees = setup({ assigneeIds: [NEWBIE] });
    await sameAssignees.service.updateAssignees(CREATOR, "st-1", { userIds: [NEWBIE] });
    const reorder = setup();
    await reorder.service.update(CREATOR, "st-1", { move: { beforeId: null, afterId: null } });
    expect([...resave.logged, ...sameTitle.logged, ...sameAssignees.logged, ...reorder.logged]).toEqual([]);
  });

  it("logs an assignee change with the names, and clearing it with none", async () => {
    const assign = setup();
    await assign.service.updateAssignees(CREATOR, "st-1", { userIds: [NEWBIE] });
    const clear = setup({ assigneeIds: [NEWBIE] });
    await clear.service.updateAssignees(CREATOR, "st-1", { userIds: [] });
    expect([...assign.logged, ...clear.logged]).toEqual([
      { type: "SUBTASK_ASSIGNED", actorId: CREATOR, fromValue: "حجز القاعة", toValue: `name:${NEWBIE}` },
      { type: "SUBTASK_ASSIGNED", actorId: CREATOR, fromValue: "حجز القاعة", toValue: null },
    ]);
  });

  it("logs deleting a subtask with its title", async () => {
    const { service, logged } = setup();
    await service.remove(CREATOR, "st-1");
    expect(logged).toEqual([{ type: "SUBTASK_DELETED", actorId: CREATOR, fromValue: "حجز القاعة", toValue: null }]);
  });
});
