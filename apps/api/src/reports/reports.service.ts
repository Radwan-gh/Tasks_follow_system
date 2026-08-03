import { Injectable } from "@nestjs/common";
import type {
  CompletedTasksReport,
  OverdueTasksReport,
  ReportOverview,
  WorkloadReport,
} from "@app/types";
import { PrismaService } from "../prisma/prisma.service";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Report 1 — every (non-archived) board with the number of active cards in
   * each of its lists. Card counts come from a single `groupBy` rather than a
   * filtered relation count, so this stays one aggregate query for all boards.
   */
  async overview(): Promise<ReportOverview> {
    const boards = await this.prisma.board.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      include: {
        lists: {
          where: { isArchived: false },
          orderBy: { position: "asc" },
          select: { id: true, name: true, statusCategory: true },
        },
      },
    });

    const grouped = await this.prisma.card.groupBy({
      by: ["listId"],
      where: { isArchived: false },
      _count: { _all: true },
    });
    const countByList = new Map(grouped.map((g) => [g.listId, g._count._all]));

    return {
      generatedAt: new Date().toISOString(),
      boards: boards.map((board) => {
        const lists = board.lists.map((list) => ({
          listId: list.id,
          listName: list.name,
          statusCategory: list.statusCategory,
          count: countByList.get(list.id) ?? 0,
        }));
        return {
          boardId: board.id,
          boardName: board.name,
          totalCards: lists.reduce((sum, l) => sum + l.count, 0),
          lists,
        };
      }),
    };
  }

  /**
   * Report 2 — tasks completed within a window (default: last 7 days). A task
   * is "completed" when it is moved into a list whose `statusCategory` is
   * `DONE`. We match MOVED activities in the window against the set of DONE list
   * names per board (activities snapshot list *names* in `toValue`), and dedupe
   * by card keeping the most recent completion.
   */
  async completed(since?: string): Promise<CompletedTasksReport> {
    const sinceDate = parseSince(since);
    const boardNames = await this.boardNameMap();

    const doneLists = await this.prisma.list.findMany({
      where: { statusCategory: "DONE" },
      select: { name: true, boardId: true },
    });
    const doneKeys = new Set(doneLists.map((l) => `${l.boardId}::${l.name}`));

    const activities = await this.prisma.cardActivity.findMany({
      where: { type: "MOVED", createdAt: { gte: sinceDate } },
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: { displayName: true } },
        card: { select: { id: true, title: true } },
      },
    });

    const seen = new Set<string>();
    const tasks: CompletedTasksReport["tasks"] = [];
    for (const activity of activities) {
      if (!activity.toValue) continue;
      if (!doneKeys.has(`${activity.boardId}::${activity.toValue}`)) continue;
      if (seen.has(activity.cardId)) continue;
      seen.add(activity.cardId);
      tasks.push({
        cardId: activity.cardId,
        cardTitle: activity.card.title,
        boardId: activity.boardId,
        boardName: boardNames.get(activity.boardId) ?? "",
        listName: activity.toValue,
        completedAt: activity.createdAt.toISOString(),
        actorName: activity.actor.displayName,
      });
    }

    return {
      since: sinceDate.toISOString(),
      generatedAt: new Date().toISOString(),
      total: tasks.length,
      tasks,
    };
  }

  /**
   * Report 3a — overdue tasks: past their due date, not archived, and not in a
   * DONE list (null-category/manual lists count as not-done).
   */
  async overdue(): Promise<OverdueTasksReport> {
    const now = new Date();
    const boardNames = await this.boardNameMap();
    const cards = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        dueDate: { lt: now },
        NOT: { list: { statusCategory: "DONE" } },
      },
      orderBy: { dueDate: "asc" },
      include: {
        list: { select: { name: true } },
        assignees: { select: { user: { select: { displayName: true } } } },
      },
    });

    const tasks = cards
      .filter((card): card is typeof card & { dueDate: Date } => card.dueDate !== null)
      .map((card) => ({
        cardId: card.id,
        cardTitle: card.title,
        boardId: card.boardId,
        boardName: boardNames.get(card.boardId) ?? "",
        listName: card.list.name,
        dueDate: card.dueDate.toISOString(),
        assigneeNames: card.assignees.map((a) => a.user.displayName),
      }));

    return { generatedAt: now.toISOString(), total: tasks.length, tasks };
  }

  /** boardId → board name, for reports that only carry a denormalized boardId. */
  private async boardNameMap(): Promise<Map<string, string>> {
    const boards = await this.prisma.board.findMany({ select: { id: true, name: true } });
    return new Map(boards.map((b) => [b.id, b.name]));
  }

  /**
   * Report 3b — workload: for each user, how many open tasks (non-archived, not
   * in a DONE list) are assigned to them. Sorted by load, heaviest first.
   */
  async workload(): Promise<WorkloadReport> {
    const assignments = await this.prisma.cardAssignee.findMany({
      where: { card: { isArchived: false, NOT: { list: { statusCategory: "DONE" } } } },
      select: { userId: true, user: { select: { displayName: true, email: true } } },
    });

    const byUser = new Map<string, { displayName: string; email: string; openCards: number }>();
    for (const a of assignments) {
      const current = byUser.get(a.userId);
      if (current) current.openCards += 1;
      else byUser.set(a.userId, { displayName: a.user.displayName, email: a.user.email, openCards: 1 });
    }

    const assignees = [...byUser.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((x, y) => y.openCards - x.openCards);

    return { generatedAt: new Date().toISOString(), assignees };
  }
}

/** Parse an optional ISO `since`, defaulting to (and guarding against) 7 days ago. */
function parseSince(since?: string): Date {
  if (since) {
    const parsed = new Date(since);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(Date.now() - WEEK_MS);
}
