import { describe, expect, it } from "vitest";
import type { BoardsService } from "../boards/boards.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SubtasksService } from "./subtasks.service";

const CREATOR = "u-creator";
const CARD_ASSIGNEE = "u-card-assignee";
const ACTOR = "u-actor";
const NEWBIE = "u-newbie";

interface Sent {
  userId: string;
  actorId: string;
  type: string;
  payload?: Record<string, unknown>;
}

/** Just enough of Prisma for subtask assign/tick, kept in memory. */
function setup(subtaskOverrides: { isDone?: boolean; assigneeIds?: string[] } = {}) {
  const card = {
    id: "card-1",
    boardId: "board-1",
    title: "تجهيز العرض",
    createdById: CREATOR,
    isRestricted: false,
    members: [],
    assignees: [{ userId: CARD_ASSIGNEE }],
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
    update: async ({ data }: { data: { title?: string; isDone?: boolean } }) => {
      if (data.title !== undefined) subtask.title = data.title;
      if (data.isDone !== undefined) subtask.isDone = data.isDone;
      return { ...subtask };
    },
  };
  const subtaskAssignee = {
    deleteMany: async () => {
      subtask.assignees = [];
    },
    createMany: async ({ data }: { data: { userId: string }[] }) => {
      subtask.assignees = data.map((d) => ({ userId: d.userId }));
    },
  };
  const prisma = {
    card: { findUnique: async () => card },
    board: { findUnique: async () => ({ ownerId: CREATOR }) },
    boardMember: {
      findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
        where.userId.in.map((userId) => ({ userId, user: { isActive: true } })),
    },
    subtask: subtaskModel,
    subtaskAssignee,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ subtask: subtaskModel, subtaskAssignee }),
  } as unknown as PrismaService;
  const boards = {
    assertMembership: async () => ({ supervised: false }),
    assertBoardMutable: async () => undefined,
  } as unknown as BoardsService;

  const sent: Sent[] = [];
  // Mirrors the real `notify`'s own-action guard so the test asserts on what would actually be written.
  const notifications = {
    notify: async (_tx: unknown, input: Sent) => {
      if (input.userId !== input.actorId) sent.push(input);
    },
  } as unknown as NotificationsService;

  return { service: new SubtasksService(prisma, boards, notifications), sent };
}

describe("SubtasksService notifications", () => {
  it("notifies only newly-added subtask assignees", async () => {
    const { service, sent } = setup({ assigneeIds: [CARD_ASSIGNEE] });
    await service.updateAssignees(ACTOR, "st-1", { userIds: [CARD_ASSIGNEE, NEWBIE] });
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
    await service.updateAssignees(ACTOR, "st-1", { userIds: [ACTOR] });
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
    await rename.service.update(ACTOR, "st-1", { title: "حجز قاعة أكبر" });
    expect([...untick.sent, ...resave.sent, ...rename.sent]).toEqual([]);
  });
});
