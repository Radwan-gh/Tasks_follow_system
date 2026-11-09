import { ForbiddenException, GoneException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { BoardsService } from "../boards/boards.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CardsService } from "./cards.service";
import { isRestorable, purgeCutoff, RESTORE_GRACE_MS, RESTORE_WINDOW_MS, restoreDeadline } from "./card-deletion.util";
import { COPY_SUFFIX, duplicateCardFields, duplicateTitle } from "./card-duplicate.util";

/*
 * Duplicating a task and deleting it with a 30-second undo
 * (docs/05-boards-lists-cards.md), against just enough of Prisma kept in memory.
 */

const OWNER = "u-owner";
const CREATOR = "u-creator";
const MEMBER = "u-member";
const VIEWER = "u-viewer";
const GONE = "u-deactivated";

type Row = Record<string, unknown>;

/** Equality, `null`, `{ in }`, `{ lt }` and `{ gt }` — what these code paths ask for. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "card" || key === "board" || key === "list") return true;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const v = value as { in?: unknown[]; lt?: Date | string; gt?: string; not?: unknown };
      if (v.in) return v.in.includes(row[key]);
      if (v.lt !== undefined) return row[key] != null && (row[key] as Date | string) < v.lt;
      if (v.gt !== undefined) return row[key] != null && (row[key] as string) > v.gt;
      if ("not" in v) return row[key] !== v.not;
    }
    if (value === null) return row[key] == null;
    return row[key] === value;
  });
}

function sortedBy<T extends Row>(rows: T[], orderBy?: Record<string, "asc" | "desc">): T[] {
  if (!orderBy) return rows;
  const [[key, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const cmp = String(a[key]) < String(b[key]) ? -1 : String(a[key]) > String(b[key]) ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
  });
}

function setup() {
  const original: Row = {
    id: "card-1",
    boardId: "A",
    listId: "a-doing",
    position: "a1",
    title: "تجهيز العرض",
    description: "قاعة وشاشة",
    dueDate: new Date("2026-11-10T09:00:00Z"),
    dueDateHasTime: true,
    isArchived: false,
    isRestricted: true,
    priority: "HIGH",
    costAmount: new Prisma.Decimal("120.50"),
    costNote: "فاتورة 12",
    recurrence: { freq: "WEEKLY", weekdays: [0] },
    deletedAt: null,
    createdById: CREATOR,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const cards: Row[] = [
    original,
    // The next card down the column, and one pending deletion between them.
    { id: "card-2", boardId: "A", listId: "a-doing", position: "a3", isArchived: false, deletedAt: null },
    { id: "card-3", boardId: "A", listId: "a-doing", position: "a2", isArchived: false, deletedAt: new Date() },
  ];
  const assignees: Row[] = [OWNER, VIEWER, GONE].map((userId) => ({ cardId: "card-1", userId }));
  const members: Row[] = [MEMBER, GONE].map((userId) => ({ cardId: "card-1", userId }));
  const subtasks: Row[] = [
    { id: "st-2", cardId: "card-1", title: "حجز القاعة", position: "a1", isDone: true, createdById: OWNER },
    { id: "st-1", cardId: "card-1", title: "تجهيز الشرائح", position: "a0", isDone: false, createdById: OWNER },
  ];
  const subtaskAssignees: Row[] = [
    { subtaskId: "st-1", userId: MEMBER },
    { subtaskId: "st-2", userId: VIEWER },
  ];
  const attachments: Row[] = [{ cardId: "card-1", filename: "x__file.pdf" }];
  const notifications: Row[] = [{ cardId: "card-1", userId: OWNER }];
  const activities: Row[] = [];
  const removedFiles: string[] = [];
  const notified: Row[] = [];
  let nextId = 1;

  const withRelations = (card: Row) => ({
    ...card,
    members: members.filter((m) => m.cardId === card.id).map(({ userId }) => ({ userId })),
    assignees: assignees.filter((a) => a.cardId === card.id).map(({ userId }) => ({ userId })),
    boardLinks: [],
  });

  const db = {
    card: {
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: Record<string, "asc" | "desc"> }) =>
        sortedBy(cards.filter((c) => matches(c, where)), orderBy)[0] ?? null,
      findUniqueOrThrow: async ({ where }: { where: Row }) => withRelations(cards.find((c) => matches(c, where))!),
      findMany: async ({ where }: { where: Row }) =>
        cards
          .filter((c) => matches(c, where))
          .map((c) => ({ id: c.id, attachments: attachments.filter((a) => a.cardId === c.id) })),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `copy-${nextId++}`, isArchived: false, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        cards.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(cards.find((c) => matches(c, where))!, data),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = cards.filter((c) => matches(c, where));
        for (const c of hit) Object.assign(c, data);
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const hit = cards.filter((c) => matches(c, where));
        for (const c of hit) cards.splice(cards.indexOf(c), 1);
        return { count: hit.length };
      },
    },
    cardBoardLink: { findFirst: async () => null },
    list: { findUnique: async ({ where }: { where: Row }) => ({ id: where.id, name: "قيد التنفيذ" }) },
    boardMember: {
      // The caller can add tasks on the home board.
      findMany: async ({ where }: { where: Row }) => [{ boardId: "A", userId: where.userId }],
    },
    subtask: {
      findMany: async ({ where }: { where: Row }) =>
        sortedBy(subtasks.filter((s) => matches(s, where)), { position: "asc" }).map((s) => ({
          ...s,
          assignees: subtaskAssignees.filter((a) => a.subtaskId === s.id).map(({ userId }) => ({ userId })),
        })),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `st-copy-${nextId++}`, isDone: false, ...data };
        subtasks.push(row);
        return row;
      },
    },
    cardAssignee: { createMany: async ({ data }: { data: Row[] }) => assignees.push(...data) },
    cardMember: { createMany: async ({ data }: { data: Row[] }) => members.push(...data) },
    subtaskAssignee: { createMany: async ({ data }: { data: Row[] }) => subtaskAssignees.push(...data) },
    cardActivity: { create: async ({ data }: { data: Row }) => activities.push(data) },
    notification: {
      deleteMany: async ({ where }: { where: Row }) => {
        for (const n of notifications.filter((row) => matches(row, where))) notifications.splice(notifications.indexOf(n), 1);
      },
    },
  };
  const prisma = { ...db, $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db) } as unknown as PrismaService;

  const people: Record<string, { role: string; isActive: boolean }> = {
    [OWNER]: { role: "OWNER", isActive: true },
    [CREATOR]: { role: "MEMBER", isActive: true },
    [MEMBER]: { role: "MEMBER", isActive: true },
    [VIEWER]: { role: "VIEWER", isActive: true },
    [GONE]: { role: "MEMBER", isActive: false },
  };
  const boards = {
    assertCardAccess: async (_userId: string, cardId: string, _role: string, opts: { includeDeleted?: boolean } = {}) => {
      const card = cards.find((c) => c.id === cardId && (opts.includeDeleted || c.deletedAt == null));
      if (!card) throw new Error("Card not found");
      return { role: "MEMBER", supervised: false, card: withRelations(card), boardIds: ["A"], ownerIds: [OWNER] };
    },
    cardPeople: async (_boardIds: string[], userIds: string[]) =>
      userIds
        .filter((id) => people[id])
        .map((userId) => ({ userId, boardId: "A", role: people[userId].role, user: { displayName: userId, isActive: people[userId].isActive } })),
  } as unknown as BoardsService;
  const notificationsService = {
    notify: async (_tx: unknown, input: Row) => {
      if (input.userId !== input.actorId) notified.push(input);
    },
  } as unknown as NotificationsService;
  const storage = { remove: async (key: string) => void removedFiles.push(key) };

  const service = new CardsService(prisma, boards, notificationsService, storage as never);
  return { service, cards, assignees, members, subtasks, subtaskAssignees, activities, notifications, notified, removedFiles };
}

describe("duplicate title and fields", () => {
  it("appends «(نسخة)»", () => {
    expect(duplicateTitle("تجهيز العرض")).toBe("تجهيز العرض (نسخة)");
  });

  it("cuts a long title so the copy still fits 300 characters", () => {
    const copy = duplicateTitle("ب".repeat(300));
    expect(copy).toHaveLength(300);
    expect(copy.endsWith(COPY_SUFFIX)).toBe(true);
    // No double space where the cut lands on one.
    expect(duplicateTitle(`${"ب".repeat(292)} ${"ج".repeat(7)}`)).toBe(`${"ب".repeat(292)}${COPY_SUFFIX}`);
  });

  it("copies every detail, cost included, and a missing repeat rule as JSON null", () => {
    const fields = duplicateCardFields({
      title: "مهمة",
      description: null,
      dueDate: null,
      dueDateHasTime: false,
      priority: "MEDIUM",
      costAmount: new Prisma.Decimal("5"),
      costNote: null,
      recurrence: null,
      isRestricted: false,
    });
    expect(fields).toMatchObject({ title: "مهمة (نسخة)", priority: "MEDIUM", isRestricted: false });
    expect(fields.costAmount?.toString()).toBe("5");
    expect(fields.recurrence).toBe(Prisma.JsonNull);
  });
});

describe("the undo window", () => {
  const at = new Date("2026-11-04T10:00:00Z");

  it("promises 30 seconds", () => {
    expect(restoreDeadline(at).toISOString()).toBe("2026-11-04T10:00:30.000Z");
  });

  it("accepts a restore until the window plus a little grace, and purges only after that", () => {
    const lastMoment = new Date(at.getTime() + RESTORE_WINDOW_MS + RESTORE_GRACE_MS);
    expect(isRestorable(at, lastMoment)).toBe(true);
    expect(at < purgeCutoff(lastMoment)).toBe(false);
    const after = new Date(lastMoment.getTime() + 1);
    expect(isRestorable(at, after)).toBe(false);
    expect(at < purgeCutoff(after)).toBe(true);
  });
});

describe("duplicating a task", () => {
  it("puts the copy right after the original, before the next card, and past one pending deletion", async () => {
    const { service, cards } = setup();
    const copy = await service.duplicate(MEMBER, "card-1");
    expect(copy).toMatchObject({ listId: "a-doing", boardId: "A", title: "تجهيز العرض (نسخة)", createdById: MEMBER });
    // Between the original (a1) and the next row of any kind (card-3 at a2, pending deletion).
    expect(copy.position > "a1" && copy.position < "a2").toBe(true);
    expect(cards.find((c) => c.id === copy.id)).toMatchObject({ isArchived: false, deletedAt: null });
  });

  it("copies the details, and the assignees and access members who still qualify", async () => {
    const { service } = setup();
    const copy = await service.duplicate(MEMBER, "card-1");
    expect(copy).toMatchObject({
      description: "قاعة وشاشة",
      dueDate: "2026-11-10T09:00:00.000Z",
      dueDateHasTime: true,
      priority: "HIGH",
      costAmount: "120.5",
      costNote: "فاتورة 12",
      recurrence: { freq: "WEEKLY", weekdays: [0] },
      isRestricted: true,
    });
    // A viewer is never an assignee, a deactivated account takes no new work or access.
    expect(copy.assigneeIds).toEqual([OWNER]);
    expect(copy.memberIds).toEqual([MEMBER]);
  });

  it("copies the checklist in order, unticked, credited to the caller", async () => {
    const { service, subtasks, subtaskAssignees } = setup();
    const copy = await service.duplicate(MEMBER, "card-1");
    const copied = subtasks.filter((s) => s.cardId === copy.id);
    expect(copied.map((s) => [s.title, s.position, s.isDone, s.createdById])).toEqual([
      ["تجهيز الشرائح", "a0", false, MEMBER],
      ["حجز القاعة", "a1", false, MEMBER],
    ]);
    // st-1's member stays on it; st-2's viewer does not.
    expect(subtaskAssignees.filter((a) => copied.some((s) => s.id === a.subtaskId)).map((a) => a.userId)).toEqual([
      MEMBER,
    ]);
  });

  it("starts the copy's own history and tells its assignees, not the caller", async () => {
    const { service, activities, notified } = setup();
    const copy = await service.duplicate(MEMBER, "card-1");
    expect(activities).toEqual([
      expect.objectContaining({ cardId: copy.id, type: "CREATED", actorId: MEMBER, toValue: "قيد التنفيذ" }),
    ]);
    expect(notified.map((n) => [n.type, n.userId])).toEqual([["ASSIGNED", OWNER]]);
  });
});

describe("deleting with a 30-second undo", () => {
  it("hides the task at once and reports until when it can come back", async () => {
    const { service, cards } = setup();
    const before = Date.now();
    const { restoreUntil } = await service.remove(CREATOR, "card-1");
    const card = cards.find((c) => c.id === "card-1")!;
    expect(card.deletedAt).toBeInstanceOf(Date);
    expect(new Date(restoreUntil).getTime() - (card.deletedAt as Date).getTime()).toBe(RESTORE_WINDOW_MS);
    expect(new Date(restoreUntil).getTime()).toBeGreaterThanOrEqual(before + RESTORE_WINDOW_MS);
  });

  it("is still the task owner's alone, deleting and restoring", async () => {
    const { service } = setup();
    await expect(service.remove(MEMBER, "card-1")).rejects.toBeInstanceOf(ForbiddenException);
    await service.remove(CREATOR, "card-1");
    await expect(service.restore(MEMBER, "card-1")).rejects.toBeInstanceOf(ForbiddenException);
    // The board owner, too, not only the creator who deleted it.
    await expect(service.restore(OWNER, "card-1")).resolves.toMatchObject({ id: "card-1" });
  });

  it("restores the task where it was within the window", async () => {
    const { service, cards } = setup();
    await service.remove(CREATOR, "card-1");
    const restored = await service.restore(OWNER, "card-1");
    expect(restored).toMatchObject({ id: "card-1", listId: "a-doing", position: "a1" });
    expect(cards.find((c) => c.id === "card-1")!.deletedAt).toBeNull();
  });

  it("refuses a late restore with 410 and deletes the task for good", async () => {
    const { service, cards, notifications, removedFiles } = setup();
    cards.find((c) => c.id === "card-1")!.deletedAt = new Date(Date.now() - RESTORE_WINDOW_MS - RESTORE_GRACE_MS - 1000);
    await expect(service.restore(CREATOR, "card-1")).rejects.toBeInstanceOf(GoneException);
    expect(cards.some((c) => c.id === "card-1")).toBe(false);
    expect(notifications).toEqual([]);
    expect(removedFiles).toEqual(["x__file.pdf"]);
  });

  it("purges only what is past its window", async () => {
    const { service, cards } = setup();
    const now = new Date();
    cards.find((c) => c.id === "card-3")!.deletedAt = new Date(now.getTime() - 10_000);
    cards.find((c) => c.id === "card-1")!.deletedAt = new Date(now.getTime() - 60_000);
    expect(await service.purgeDeletedCards(now)).toBe(1);
    expect(cards.map((c) => c.id)).toEqual(["card-2", "card-3"]);
  });
});
