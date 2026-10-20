import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { RecurrenceRule } from "@app/types";
import type { BoardsService } from "../boards/boards.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CardsService } from "./cards.service";
import { RecurrenceJobsService } from "./recurrence-jobs.service";

const OWNER = "u-owner";
const ASSIGNEE = "u-assignee";
// Wednesdays, date-only — like the weekly tasks this was built for.
const WEDNESDAYS: RecurrenceRule = { freq: "WEEKLY", weekdays: [3] };

type Row = Record<string, unknown> & { id: string };

const LISTS: Record<string, { id: string; boardId: string; name: string; statusCategory: string }> = {
  "list-new": { id: "list-new", boardId: "board-1", name: "جديد", statusCategory: "NEW" },
  "list-doing": { id: "list-doing", boardId: "board-1", name: "قيد التنفيذ", statusCategory: "IN_PROGRESS" },
  "list-done": { id: "list-done", boardId: "board-1", name: "تم التنفيذ", statusCategory: "DONE" },
  "list-closed": { id: "list-closed", boardId: "board-1", name: "انتهى", statusCategory: "CLOSED" },
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

/**
 * Cards kept in memory — just enough of Prisma for moves and spawns, including
 * the unique `previousInstanceId` that makes spawning happen at most once.
 */
function setup(overrides: Partial<Row> = {}) {
  const cards = new Map<string, Row>();
  let seq = 0;
  cards.set("card-1", {
    id: "card-1",
    listId: "list-doing",
    boardId: "board-1",
    title: "تجهيز شرائح المحاضرات الأسبوعية",
    description: null,
    dueDate: new Date("2026-10-07T00:00:00.000Z"),
    dueDateHasTime: false,
    isArchived: false,
    isRestricted: false,
    priority: "NORMAL",
    costAmount: null,
    costNote: null,
    recurrence: WEDNESDAYS,
    previousInstanceId: null,
    recurrenceSeriesId: null,
    recurrenceIndex: null,
    position: "a0",
    createdById: OWNER,
    createdAt: new Date("2026-10-05T10:00:00.000Z"),
    updatedAt: new Date("2026-10-05T10:00:00.000Z"),
    ...overrides,
  });

  const ref = (row: Row | undefined) =>
    row ? { id: row.id, boardId: row.boardId, title: row.title, dueDate: row.dueDate } : null;
  /** A card with the relations every caller here includes. */
  const withRelations = (row: Row) => ({
    ...row,
    members: [],
    assignees: row.id === "card-1" ? [{ userId: ASSIGNEE }] : [],
    boardLinks: [],
    previousInstance: ref(cards.get(row.previousInstanceId as string)),
    nextInstance: ref([...cards.values()].find((c) => c.previousInstanceId === row.id)),
  });

  const db = {
    card: {
      findUnique: async ({ where }: { where: { id?: string; previousInstanceId?: string } }) => {
        if (where.previousInstanceId) {
          const next = [...cards.values()].find((c) => c.previousInstanceId === where.previousInstanceId);
          return next ? withRelations(next) : null;
        }
        const row = cards.get(where.id!);
        return row ? withRelations(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => withRelations(cards.get(where.id)!),
      findFirst: async () => null,
      // The due-date job's query, applied in memory.
      findMany: async ({ where }: { where: { dueDate: { lte: Date } } }) =>
        [...cards.values()].filter(
          (c) =>
            !c.isArchived &&
            c.recurrence != null &&
            c.dueDate != null &&
            (c.dueDate as Date) <= where.dueDate.lte &&
            ![...cards.values()].some((n) => n.previousInstanceId === c.id) &&
            LISTS[c.listId as string].statusCategory !== "CLOSED",
        ),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = cards.get(where.id)!;
        for (const [key, value] of Object.entries(data)) if (value !== undefined) row[key] = value;
        return withRelations(row);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if ([...cards.values()].some((c) => c.previousInstanceId === data.previousInstanceId)) throw uniqueViolation();
        const row = { ...data, id: `spawned-${++seq}`, isArchived: false, createdAt: new Date(), updatedAt: new Date() };
        cards.set(row.id, row);
        return row;
      },
    },
    list: {
      findUnique: async ({ where }: { where: { id: string } }) => LISTS[where.id] ?? null,
      findFirst: async ({ where }: { where: { boardId: string; statusCategory: string } }) =>
        Object.values(LISTS).find((l) => l.boardId === where.boardId && l.statusCategory === where.statusCategory) ??
        null,
    },
    cardBoardLink: { findFirst: async () => null, create: async () => undefined },
    cardActivity: { create: async () => undefined },
    cardAssignee: { createMany: async () => undefined },
    cardMember: { createMany: async () => undefined },
    subtask: { findMany: async () => [] },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })),
    },
  };
  const prisma = { ...db, $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db) } as unknown as PrismaService;
  const boards = {
    assertCardAccess: async (_userId: string, cardId: string) => ({
      role: "MEMBER",
      supervised: false,
      card: withRelations(cards.get(cardId)!),
      boardIds: ["board-1"],
      ownerIds: [OWNER],
    }),
    assertCanManageCard: () => undefined,
  } as unknown as BoardsService;
  const notified: { userId: string; type: string; cardId: string }[] = [];
  const notifications = {
    notify: async (_tx: unknown, n: { userId: string; actorId: string; type: string; cardId: string }) => {
      if (n.userId !== n.actorId) notified.push({ userId: n.userId, type: n.type, cardId: n.cardId });
    },
  } as unknown as NotificationsService;

  const service = new CardsService(prisma, boards, notifications);
  return {
    cards: service,
    jobs: new RecurrenceJobsService(prisma, service),
    store: cards,
    notified,
    spawned: () => [...cards.values()].filter((c) => c.id.startsWith("spawned-")),
  };
}

describe("spawning the next instance of a repeating task", () => {
  it("spawns it, linked, as soon as the task is moved to «تم التنفيذ» — before its due date", async () => {
    const { cards, spawned } = setup({ dueDate: new Date("2026-12-02T00:00:00.000Z") });
    const response = await cards.update(OWNER, "card-1", { targetListId: "list-done" });

    const [next] = spawned();
    expect(spawned()).toHaveLength(1);
    expect(next).toMatchObject({
      listId: "list-new",
      previousInstanceId: "card-1",
      recurrenceSeriesId: "card-1",
      recurrenceIndex: 2,
      dueDateHasTime: false,
    });
    expect((next.dueDate as Date).toISOString()).toBe("2026-12-09T00:00:00.000Z");
    // The response links the instance just created; the finished one becomes cycle 1.
    expect(response.nextInstance?.id).toBe(next.id);
    expect(response).toMatchObject({ recurrenceSeriesId: "card-1", recurrenceIndex: 1 });
  });

  it("does not spawn again when the task then moves on to «انتهى», or is reopened and finished again", async () => {
    const { cards, spawned } = setup({ dueDate: new Date("2026-12-02T00:00:00.000Z") });
    await cards.update(OWNER, "card-1", { targetListId: "list-done" });
    await cards.update(OWNER, "card-1", { targetListId: "list-closed" });
    await cards.update(OWNER, "card-1", { targetListId: "list-doing" });
    await cards.update(OWNER, "card-1", { targetListId: "list-done" });
    expect(spawned()).toHaveLength(1);
  });

  it("still spawns when the task goes straight to «انتهى»", async () => {
    const { cards, spawned } = setup({ dueDate: new Date("2026-12-02T00:00:00.000Z") });
    await cards.update(OWNER, "card-1", { targetListId: "list-closed" });
    expect(spawned()).toHaveLength(1);
  });

  it("spawns nothing for a task that does not repeat, or a move that does not finish it", async () => {
    const plain = setup({ recurrence: null });
    await plain.cards.update(OWNER, "card-1", { targetListId: "list-done" });
    expect(plain.spawned()).toHaveLength(0);

    const repeating = setup();
    await repeating.cards.update(OWNER, "card-1", { targetListId: "list-new" });
    expect(repeating.spawned()).toHaveLength(0);
  });

  it("carries the series and counts the cycles along the chain", async () => {
    const { cards, spawned } = setup({ dueDate: new Date("2026-12-02T00:00:00.000Z") });
    await cards.update(OWNER, "card-1", { targetListId: "list-done" });
    const second = spawned()[0];
    await cards.update(OWNER, second.id, { targetListId: "list-done" });
    const third = spawned().find((c) => c.previousInstanceId === second.id)!;
    expect(third).toMatchObject({ recurrenceSeriesId: "card-1", recurrenceIndex: 3 });
    expect((third.dueDate as Date).toISOString()).toBe("2026-12-16T00:00:00.000Z");
  });
});

describe("RecurrenceJobsService.spawnDueRecurrences", () => {
  it("spawns for a task left in «تم التنفيذ» once its due date has passed, skipping missed cycles", async () => {
    // Due Wednesday 2026-10-07, never closed; the sweep runs on Tuesday 2026-10-20.
    const { jobs, spawned, notified } = setup({ listId: "list-done" });
    expect(await jobs.spawnDueRecurrences(new Date("2026-10-20T09:00:00.000Z"))).toBe(1);

    const [next] = spawned();
    expect(next).toMatchObject({ previousInstanceId: "card-1", recurrenceSeriesId: "card-1", recurrenceIndex: 2 });
    expect((next.dueDate as Date).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    // System-generated, so every carried-over assignee hears about it.
    expect(notified).toEqual([{ userId: ASSIGNEE, type: "ASSIGNED", cardId: next.id }]);
  });

  it("waits for the end of a date-only due day", async () => {
    const { jobs, spawned } = setup({ dueDate: new Date("2026-10-21T00:00:00.000Z") });
    // Wednesday 2026-10-21 at 23:00 Damascus — the due day is not over yet.
    await jobs.spawnDueRecurrences(new Date("2026-10-21T20:00:00.000Z"));
    expect(spawned()).toHaveLength(0);
    // Just after midnight it is.
    await jobs.spawnDueRecurrences(new Date("2026-10-21T21:00:00.000Z"));
    expect(spawned()).toHaveLength(1);
  });

  it("runs once per instance, and leaves closed and archived tasks alone", async () => {
    const now = new Date("2026-10-20T09:00:00.000Z");
    const open = setup();
    await open.jobs.spawnDueRecurrences(now);
    await open.jobs.spawnDueRecurrences(now);
    expect(open.spawned()).toHaveLength(1);

    const closed = setup({ listId: "list-closed" });
    await closed.jobs.spawnDueRecurrences(now);
    expect(closed.spawned()).toHaveLength(0);

    const archived = setup({ isArchived: true });
    await archived.jobs.spawnDueRecurrences(now);
    expect(archived.spawned()).toHaveLength(0);
  });

  it("does nothing more when a move already spawned the next instance", async () => {
    const { cards, jobs, spawned } = setup();
    await cards.update(OWNER, "card-1", { targetListId: "list-done" });
    expect(await jobs.spawnDueRecurrences(new Date("2026-10-20T09:00:00.000Z"))).toBe(0);
    expect(spawned()).toHaveLength(1);
  });
});
