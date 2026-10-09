import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { NotificationsService } from "./notifications.service";
import { deadlineOf, ScheduledJobsService } from "./scheduled-jobs.service";

const NOW = new Date("2026-10-09T09:00:00Z");
const HOUR = 60 * 60 * 1000;

interface Row {
  userId: string;
  type: string;
  cardId: string;
  payload: Record<string, unknown> | null;
}

function setup(card: { dueDate: Date; dueDateHasTime?: boolean; assignees?: string[] }, alreadySent: Row[] = []) {
  const rows = [...alreadySent];
  const openCard = {
    id: "card-1",
    title: "تسليم التقرير",
    boardId: "board-1",
    dueDate: card.dueDate,
    dueDateHasTime: card.dueDateHasTime ?? true,
    createdById: "u-creator",
    assignees: (card.assignees ?? []).map((userId) => ({ userId })),
  };
  const prisma = {
    // Mirrors the real query's coarse 48h window; the service narrows it itself.
    card: { findMany: async () => (openCard.dueDate.getTime() < NOW.getTime() + 48 * HOUR ? [openCard] : []) },
    notification: { findMany: async () => rows },
  } as unknown as PrismaService;
  const notifications = {
    notify: async (_tx: unknown, input: Row) => {
      rows.push(input);
    },
  } as unknown as NotificationsService;
  return { jobs: new ScheduledJobsService(prisma, notifications), rows };
}

describe("ScheduledJobsService due-date sweep", () => {
  it("warns the assignees once a card is within 24 hours of its due date", async () => {
    const { jobs, rows } = setup({ dueDate: new Date(NOW.getTime() + 5 * HOUR), assignees: ["u-a", "u-b"] });
    await jobs.sweepDueDates(NOW);
    expect(rows.map((r) => [r.userId, r.type])).toEqual([
      ["u-a", "DUE_SOON"],
      ["u-b", "DUE_SOON"],
    ]);
  });

  it("falls back to the creator when nobody is assigned", async () => {
    const { jobs, rows } = setup({ dueDate: new Date(NOW.getTime() - HOUR) });
    await jobs.sweepDueDates(NOW);
    expect(rows.map((r) => [r.userId, r.type])).toEqual([["u-creator", "OVERDUE"]]);
  });

  it("says nothing for a card due more than a day away", async () => {
    const { jobs, rows } = setup({ dueDate: new Date(NOW.getTime() + 30 * HOUR), assignees: ["u-a"] });
    await jobs.sweepDueDates(NOW);
    expect(rows).toEqual([]);
  });

  it("does not repeat a reminder on the next hourly run", async () => {
    const { jobs, rows } = setup({ dueDate: new Date(NOW.getTime() + 5 * HOUR), assignees: ["u-a"] });
    await jobs.sweepDueDates(NOW);
    await jobs.sweepDueDates(NOW);
    expect(rows).toHaveLength(1);
  });

  it("re-arms the reminder when the due date moves", async () => {
    const dueDate = new Date(NOW.getTime() + 5 * HOUR);
    const earlier = { userId: "u-a", type: "DUE_SOON", cardId: "card-1", payload: { dueDate: new Date(NOW.getTime() + 2 * HOUR).toISOString() } };
    const { jobs, rows } = setup({ dueDate, assignees: ["u-a"] }, [earlier]);
    await jobs.sweepDueDates(NOW);
    expect(rows).toHaveLength(2);
    expect(rows[1].payload).toMatchObject({ dueDate: dueDate.toISOString() });
  });

  it("treats a reminder sent before due dates were recorded as already sent", async () => {
    const legacy = { userId: "u-a", type: "OVERDUE", cardId: "card-1", payload: { cardTitle: "تسليم التقرير" } };
    const { jobs, rows } = setup({ dueDate: new Date(NOW.getTime() - HOUR), assignees: ["u-a"] }, [legacy]);
    await jobs.sweepDueDates(NOW);
    expect(rows).toHaveLength(1);
  });

  // NOW is 12:00 on 9 Oct in Asia/Damascus (UTC+3).
  it("does not call a date-only card overdue on its own due day", async () => {
    // How the web stores «9 Oct»: midnight UTC, i.e. 03:00 local — already past at NOW.
    const { jobs, rows } = setup({ dueDate: new Date("2026-10-09T00:00:00Z"), dueDateHasTime: false, assignees: ["u-a"] });
    await jobs.sweepDueDates(NOW);
    expect(rows.map((r) => r.type)).toEqual(["DUE_SOON"]);
  });

  it("calls a date-only card overdue the day after", async () => {
    const { jobs, rows } = setup({ dueDate: new Date("2026-10-08T09:00:00Z"), dueDateHasTime: false, assignees: ["u-a"] });
    await jobs.sweepDueDates(NOW);
    expect(rows.map((r) => r.type)).toEqual(["OVERDUE"]);
  });

  it("waits until the morning of the day for a date-only card due tomorrow", async () => {
    const { jobs, rows } = setup({ dueDate: new Date("2026-10-10T00:00:00Z"), dueDateHasTime: false, assignees: ["u-a"] });
    await jobs.sweepDueDates(NOW);
    expect(rows).toEqual([]);
  });
});

describe("deadlineOf", () => {
  it("ends a date-only due date at the end of its day in the users' time zone", () => {
    // Both the web's (midnight UTC) and mobile's (noon local) storage of «9 Oct».
    expect(deadlineOf(new Date("2026-10-09T00:00:00Z"), false).toISOString()).toBe("2026-10-09T20:59:59.999Z");
    expect(deadlineOf(new Date("2026-10-09T09:00:00Z"), false).toISOString()).toBe("2026-10-09T20:59:59.999Z");
  });

  it("keeps a timed due date as-is", () => {
    const at = new Date("2026-10-09T15:30:00Z");
    expect(deadlineOf(at, true)).toBe(at);
  });
});
