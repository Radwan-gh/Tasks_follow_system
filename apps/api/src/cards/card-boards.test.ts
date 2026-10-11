import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BoardsService, resolveCardRole } from "../boards/boards.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { CardsService } from "./cards.service";
import { columnForNewBoard, mergeByPosition } from "./card-placement.util";

/*
 * Multi-board tasks (docs/18-multi-board-tasks.md), run through the real
 * `BoardsService.assertCardAccess` and `CardsService` against just enough of
 * Prisma, kept in memory.
 */

const OWNER_A = "u-owner-a";
const OWNER_B = "u-owner-b";
const B_ONLY = "u-b-only";
const MEMBER = "u-member";
const ADMIN = "u-admin";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    // Relation filters (`card: { isArchived: false }`…): every fixture row is live.
    if (key === "card" || key === "board" || key === "list") return true;
    if (key === "cardId_boardId") {
      const v = value as { cardId: string; boardId: string };
      return row.cardId === v.cardId && row.boardId === v.boardId;
    }
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const v = value as { in?: unknown[]; not?: unknown; notIn?: unknown[] };
      if (v.in) return v.in.includes(row[key]);
      if (v.notIn) return !v.notIn.includes(row[key]);
      if ("not" in v) return row[key] !== v.not;
    }
    return row[key] === value;
  });
}

function sorted<T extends Row>(rows: T[], orderBy?: Record<string, "asc" | "desc">): T[] {
  if (!orderBy) return rows;
  const [[key, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const cmp = String(a[key]) < String(b[key]) ? -1 : String(a[key]) > String(b[key]) ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
  });
}

function setup() {
  const boards = [
    { id: "A", name: "لوحة أ", ownerId: OWNER_A, isArchived: false, updatedAt: new Date(2026, 0, 1) },
    { id: "B", name: "لوحة ب", ownerId: OWNER_B, isArchived: false, updatedAt: new Date(2026, 0, 1) },
    { id: "C", name: "لوحة ج", ownerId: "u-owner-c", isArchived: false, updatedAt: new Date(2026, 0, 3) },
    // From before the five-status template: no «انتهى».
    { id: "D", name: "لوحة د", ownerId: "u-owner-d", isArchived: false, updatedAt: new Date(2026, 0, 2) },
  ];
  const lists: Row[] = [];
  for (const board of ["A", "B", "C", "D"]) {
    const prefix = board.toLowerCase();
    lists.push({ id: `${prefix}-new`, boardId: board, name: "جديد", statusCategory: "NEW", position: "a0", isArchived: false });
    lists.push({ id: `${prefix}-doing`, boardId: board, name: "قيد التنفيذ", statusCategory: "IN_PROGRESS", position: "a1", isArchived: false });
    if (board !== "D") {
      lists.push({ id: `${prefix}-closed`, boardId: board, name: "انتهى", statusCategory: "CLOSED", position: "a2", isArchived: false });
    }
  }
  const memberships: Row[] = [
    { userId: OWNER_A, boardId: "A", role: "OWNER", joinedAt: 1 },
    { userId: OWNER_A, boardId: "C", role: "MEMBER", joinedAt: 2 },
    { userId: OWNER_B, boardId: "B", role: "OWNER", joinedAt: 1 },
    { userId: B_ONLY, boardId: "B", role: "MEMBER", joinedAt: 2 },
    { userId: MEMBER, boardId: "A", role: "MEMBER", joinedAt: 3 },
    { userId: MEMBER, boardId: "B", role: "MEMBER", joinedAt: 3 },
  ];
  const users: Row[] = [
    { id: ADMIN, role: "ADMIN", isActive: true, canViewAllBoards: false },
    ...[OWNER_A, OWNER_B, B_ONLY, MEMBER].map((id) => ({ id, role: "USER", isActive: true, canViewAllBoards: false })),
  ];
  const cards: Row[] = [
    {
      id: "card-1",
      boardId: "A",
      listId: "a-new",
      position: "a0",
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
      createdById: OWNER_A,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    // Another task already in B's «قيد التنفيذ», so "the end of that column" is after it.
    { id: "card-2", boardId: "B", listId: "b-doing", position: "a1", isArchived: false },
  ];
  // card-1 also shows on B.
  const links: Row[] = [{ id: "link-b", cardId: "card-1", boardId: "B", listId: "b-new", position: "a5", createdAt: 1 }];
  const activities: Row[] = [];
  let nextId = 1;

  const withRelations = (card: Row) => ({
    ...card,
    members: [],
    assignees: [],
    boardLinks: sorted(links.filter((l) => l.cardId === card.id), { createdAt: "asc" }),
  });

  const db = {
    card: {
      findUnique: async ({ where }: { where: Row }) => {
        const card = cards.find((c) => matches(c, where));
        return card ? withRelations(card) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: Row }) => withRelations(cards.find((c) => matches(c, where))!),
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: Record<string, "asc" | "desc"> }) =>
        sorted(cards.filter((c) => matches(c, where)), orderBy)[0] ?? null,
      findMany: async ({ where }: { where: Row }) => cards.filter((c) => matches(c, where)),
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const card = cards.find((c) => matches(c, where))!;
        for (const [key, value] of Object.entries(data)) if (value !== undefined) card[key] = value;
        return withRelations(card);
      },
    },
    cardBoardLink: {
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: Record<string, "asc" | "desc"> }) =>
        sorted(links.filter((l) => matches(l, where)), orderBy)[0] ?? null,
      findMany: async ({ where }: { where: Row }) => links.filter((l) => matches(l, where)),
      findUniqueOrThrow: async ({ where }: { where: Row }) => links.find((l) => matches(l, where))!,
      create: async ({ data }: { data: Row }) => {
        const link = { id: `link-${nextId++}`, createdAt: 100 + nextId, ...data };
        links.push(link);
        return link;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(links.find((l) => matches(l, where))!, data),
      delete: async ({ where }: { where: Row }) => links.splice(links.findIndex((l) => matches(l, where)), 1)[0],
      deleteMany: async ({ where }: { where: Row }) => {
        for (const link of links.filter((l) => matches(l, where))) links.splice(links.indexOf(link), 1);
      },
    },
    list: {
      findUnique: async ({ where }: { where: Row }) => lists.find((l) => matches(l, where)) ?? null,
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: Record<string, "asc" | "desc"> }) =>
        sorted(lists.filter((l) => matches(l, where)), orderBy)[0] ?? null,
    },
    board: {
      findMany: async ({ where }: { where: Row }) =>
        boards
          .filter((b) => matches(b, where))
          .map((b) => ({ ...b, lists: sorted(lists.filter((l) => l.boardId === b.id), { position: "asc" }) })),
    },
    boardMember: {
      findMany: async ({ where }: { where: Row }) =>
        memberships
          .filter((m) => matches(m, where))
          .map((m) => ({
            ...m,
            board: boards.find((b) => b.id === m.boardId),
            user: { id: m.userId, username: m.userId, displayName: m.userId, isActive: true },
          })),
    },
    user: { findUnique: async ({ where }: { where: Row }) => users.find((u) => matches(u, where)) ?? null },
    cardActivity: {
      create: async ({ data }: { data: Row }) => {
        activities.push(data);
        return data;
      },
      // The caller's latest activity per board — all `boardOptions` asks of it.
      groupBy: async ({ where }: { where: Row }) => {
        const latest = new Map<string, Date>();
        for (const a of activities.filter((row) => matches(row, where))) {
          const at = a.createdAt as Date;
          const seen = latest.get(a.boardId as string);
          if (!seen || at > seen) latest.set(a.boardId as string, at);
        }
        return [...latest].map(([boardId, createdAt]) => ({ boardId, _max: { createdAt } }));
      },
    },
  };
  const prisma = { ...db, $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db) } as unknown as PrismaService;
  const boardsService = new BoardsService(prisma, {} as never, {} as never);
  const notifications = { notify: async () => undefined } as unknown as NotificationsService;
  const service = new CardsService(prisma, boardsService, notifications);
  // The field's read-back after a change is `getBoards`' own business.
  vi.spyOn(service, "getBoards").mockResolvedValue({ boards: [], canChange: true });

  const card = () => cards[0];
  const linkOn = (boardId: string) => links.find((l) => l.cardId === "card-1" && l.boardId === boardId);
  return { service, card, linkOn, links, activities };
}

describe("resolveCardRole", () => {
  const boards = [
    { id: "A", isArchived: false },
    { id: "B", isArchived: true },
  ];
  it("takes the highest role across the task's boards", () => {
    expect(
      resolveCardRole(
        [
          { boardId: "A", role: "VIEWER" },
          { boardId: "B", role: "OWNER" },
        ],
        boards,
        "VIEWER",
        false,
      ),
    ).toBe("OWNER");
  });
  it("tells no membership from too low a one", () => {
    expect(resolveCardRole([], boards, "VIEWER", false)).toBe("none");
    expect(resolveCardRole([{ boardId: "A", role: "VIEWER" }], boards, "MEMBER", false)).toBe("forbidden");
  });
  it("writes only through a live board", () => {
    expect(resolveCardRole([{ boardId: "B", role: "OWNER" }], boards, "MEMBER", true)).toBe("archived");
    expect(
      resolveCardRole(
        [
          { boardId: "A", role: "MEMBER" },
          { boardId: "B", role: "OWNER" },
        ],
        boards,
        "MEMBER",
        true,
      ),
    ).toBe("MEMBER");
  });
});

describe("column helpers", () => {
  it("merges a column's own and linked cards by position", () => {
    const own = [{ id: "x", position: "a0" }, { id: "y", position: "a2" }];
    const linked = [{ id: "l", position: "a1" }, { id: "m", position: "a3" }];
    expect(mergeByPosition(own, linked).map((c) => c.id)).toEqual(["x", "l", "y", "m"]);
  });
  it("puts a task newly on a board in the column with its status, else «جديد», else the first", () => {
    const lists = [
      { id: "ready", statusCategory: "READY" as const },
      { id: "new", statusCategory: "NEW" as const },
      { id: "done", statusCategory: "DONE" as const },
    ];
    expect(columnForNewBoard(lists, "DONE")?.id).toBe("done");
    expect(columnForNewBoard(lists, "CLOSED")?.id).toBe("new");
    expect(columnForNewBoard([lists[0]], null)?.id).toBe("ready");
  });
});

describe("one status across boards", () => {
  it("moving the task on another of its boards moves it on every board", async () => {
    const { service, card, linkOn, activities } = setup();
    // B_ONLY reaches the task through board B alone.
    await service.update(B_ONLY, "card-1", { targetListId: "b-doing" });
    expect(linkOn("B")).toMatchObject({ listId: "b-doing" });
    expect(String(linkOn("B")!.position) > "a1").toBe(true); // after card-2, at the column's end
    expect(card()).toMatchObject({ boardId: "A", listId: "a-doing" });
    expect(activities).toEqual([
      expect.objectContaining({ type: "MOVED", boardId: "B", fromValue: "جديد", toValue: "قيد التنفيذ" }),
    ]);
  });

  it("leaves a board without that status where it was", async () => {
    const { service, card, linkOn, links } = setup();
    links.push({ id: "link-d", cardId: "card-1", boardId: "D", listId: "d-new", position: "a0", createdAt: 2 });
    await service.update(OWNER_A, "card-1", { targetListId: "a-closed" });
    expect(card().listId).toBe("a-closed");
    expect(linkOn("B")!.listId).toBe("b-closed");
    expect(linkOn("D")!.listId).toBe("d-new");
  });

  it("refuses a list on a board the task is not on", async () => {
    const { service } = setup();
    await expect(service.update(OWNER_A, "card-1", { targetListId: "c-doing" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("lets the owner of any of its boards edit and close it", async () => {
    const { service, card } = setup();
    await service.update(OWNER_B, "card-1", { title: "عنوان جديد" });
    await service.update(OWNER_B, "card-1", { targetListId: "b-closed" });
    expect(card()).toMatchObject({ title: "عنوان جديد", listId: "a-closed" });
    await expect(service.update(B_ONLY, "card-1", { title: "x" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("changing a task's boards", () => {
  it("adds a board in the column with the task's status and records it", async () => {
    const { service, linkOn, activities } = setup();
    await service.setBoards(OWNER_A, "card-1", { boardIds: ["A", "B", "C"] });
    expect(linkOn("C")).toMatchObject({ listId: "c-new" });
    expect(activities).toEqual([
      expect.objectContaining({ type: "BOARDS_CHANGED", fromValue: "لوحة أ، لوحة ب", toValue: "لوحة أ، لوحة ب، لوحة ج" }),
    ]);
  });

  it("records nothing when the boards are the same", async () => {
    const { service, activities } = setup();
    await service.setBoards(OWNER_A, "card-1", { boardIds: ["B", "A", "A"] });
    expect(activities).toEqual([]);
  });

  it("is the task owner's — not every member's — and only on boards they belong to", async () => {
    const { service } = setup();
    await expect(service.setBoards(MEMBER, "card-1", { boardIds: ["A"] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.setBoards(OWNER_A, "card-1", { boardIds: ["A", "B", "D"] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Taking it off B, which OWNER_A is not on.
    await expect(service.setBoards(OWNER_A, "card-1", { boardIds: ["A"] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets an admin use any board, member or not", async () => {
    const { service, linkOn } = setup();
    await service.setBoards(ADMIN, "card-1", { boardIds: ["A", "B", "D"] });
    expect(linkOn("D")).toMatchObject({ listId: "d-new" });
  });

  it("re-homes the task when its home board is dropped", async () => {
    const { service, card, linkOn } = setup();
    await service.setBoards(OWNER_A, "card-1", { boardIds: ["C", "B"] });
    expect(card()).toMatchObject({ boardId: "C", listId: "c-new" });
    expect(linkOn("C")).toBeUndefined();
    expect(linkOn("B")).toMatchObject({ listId: "b-new" });
  });

  it("keeps the caller on at least one of the task's boards", async () => {
    const { service } = setup();
    // OWNER_B owns the task through B but is not on A: taking it off B would lose it.
    await expect(service.setBoards(OWNER_B, "card-1", { boardIds: ["A"] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const owner = setup();
    owner.links.splice(0); // only on A now
    await expect(owner.service.setBoards(OWNER_A, "card-1", { boardIds: ["C"] })).resolves.toBeDefined();
  });
});

describe("the add-board popup's boards", () => {
  it("puts the boards the caller used most recently first, then the rest by last update", async () => {
    const { service, activities } = setup();
    // An admin may add the task to any live board it is not on yet: C and D.
    expect((await service.boardOptions(ADMIN, "card-1")).map((b) => b.id)).toEqual(["C", "D"]);
    activities.push({ actorId: ADMIN, boardId: "D", createdAt: new Date(2026, 5, 1) });
    activities.push({ actorId: OWNER_A, boardId: "C", createdAt: new Date(2026, 6, 1) }); // someone else's
    expect((await service.boardOptions(ADMIN, "card-1")).map((b) => b.id)).toEqual(["D", "C"]);
  });

  it("offers a non-admin only their own boards, and nobody but the task's owner or an admin", async () => {
    const { service } = setup();
    expect((await service.boardOptions(OWNER_A, "card-1")).map((b) => b.id)).toEqual(["C"]);
    await expect(service.boardOptions(B_ONLY, "card-1")).rejects.toBeInstanceOf(ForbiddenException);
  });
});
