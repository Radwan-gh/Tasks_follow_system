import { Injectable } from "@nestjs/common";
import type {
  CompletedTasksReport,
  OverdueTasksReport,
  ReportOverview,
  WorkloadReport,
} from "@app/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService } from "../boards/boards.service";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Which boards and cards a report covers for the caller. A supervisor
 * (`canViewAllBoards`) sees every board and every card, restricted ones
 * included — `boardIds` is null. Anyone else sees only the boards they are a
 * member of, and only the cards they could open there (`canAccessCard`).
 * The ADMIN role alone does not widen it.
 */
interface ReportScope {
  userId: string;
  /** null = every board. */
  boardIds: Set<string> | null;
}

/**
 * The cards a scope covers, as a Prisma filter: on one of its boards (home or
 * via a `CardBoardLink`), and — for a non-supervisor — visible by the same
 * rule as `canAccessCard` (open, or the caller is its creator, an explicit
 * member, or the owner of any board it is on).
 */
function cardScopeWhere(scope: ReportScope): Prisma.CardWhereInput {
  if (!scope.boardIds) return {};
  const ids = [...scope.boardIds];
  const { userId } = scope;
  return {
    AND: [
      { OR: [{ boardId: { in: ids } }, { boardLinks: { some: { boardId: { in: ids } } } }] },
      {
        OR: [
          { isRestricted: false },
          { createdById: userId },
          { members: { some: { userId } } },
          { list: { board: { ownerId: userId } } },
          { boardLinks: { some: { board: { ownerId: userId } } } },
        ],
      },
    ],
  };
}

/**
 * The board a report row shows for a card: the one the row is about when the
 * caller can see it, otherwise the first of the card's boards in scope — so a
 * row never points at a board the caller cannot open.
 */
function boardInScope(
  scope: ReportScope,
  preferred: string,
  card: { boardId: string; boardLinks: { boardId: string }[] },
): string {
  if (!scope.boardIds || scope.boardIds.has(preferred)) return preferred;
  const candidates = [card.boardId, ...card.boardLinks.map((l) => l.boardId)];
  return candidates.find((id) => scope.boardIds!.has(id)) ?? preferred;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  /** The caller's report scope — supervision is read live via `BoardsService.isSupervisor`. */
  private async scopeFor(userId: string): Promise<ReportScope> {
    if (await this.boards.isSupervisor(userId)) return { userId, boardIds: null };
    const memberships = await this.prisma.boardMember.findMany({ where: { userId }, select: { boardId: true } });
    return { userId, boardIds: new Set(memberships.map((m) => m.boardId)) };
  }

  /**
   * Report 1 — every (non-archived) board in the caller's scope with the
   * number of active cards in each of its lists. Card counts come from a
   * single `groupBy` rather than a filtered relation count, so this stays one
   * aggregate query for all boards.
   */
  async overview(userId: string): Promise<ReportOverview> {
    const scope = await this.scopeFor(userId);
    const boards = await this.prisma.board.findMany({
      where: { isArchived: false, ...(scope.boardIds ? { id: { in: [...scope.boardIds] } } : {}) },
      orderBy: { name: "asc" },
      include: {
        lists: {
          where: { isArchived: false },
          orderBy: { position: "asc" },
          select: { id: true, name: true, statusCategory: true },
        },
      },
    });

    // Only those boards' lists, and only cards the caller could open.
    const listIds = boards.flatMap((b) => b.lists.map((l) => l.id));
    const grouped = await this.prisma.card.groupBy({
      by: ["listId"],
      where: { isArchived: false, listId: { in: listIds }, ...cardScopeWhere(scope) },
      _count: { _all: true },
    });
    const countByList = new Map(grouped.map((g) => [g.listId, g._count._all]));

    // §3c-1 "التكاليف حسب اللوحة": this calendar month's cost total per board.
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const costRows = await this.prisma.card.groupBy({
      by: ["boardId"],
      where: {
        isArchived: false,
        costAmount: { not: null },
        createdAt: { gte: monthStart },
        boardId: { in: boards.map((b) => b.id) },
        ...cardScopeWhere(scope),
      },
      _sum: { costAmount: true },
    });
    const costByBoard = new Map(costRows.map((r) => [r.boardId, r._sum.costAmount]));

    return {
      generatedAt: new Date().toISOString(),
      boards: boards.map((board) => {
        const lists = board.lists.map((list) => ({
          listId: list.id,
          listName: list.name,
          statusCategory: list.statusCategory,
          count: countByList.get(list.id) ?? 0,
        }));
        const cost = costByBoard.get(board.id);
        return {
          boardId: board.id,
          boardName: board.name,
          totalCards: lists.reduce((sum, l) => sum + l.count, 0),
          lists,
          costThisMonth: cost ? cost.toString() : null,
        };
      }),
    };
  }

  /**
   * Report 2 — tasks completed within a window (default: last 7 days). A task
   * is "completed" when it is moved into a list whose `statusCategory` is
   * `DONE`. We match MOVED activities in the window against the set of DONE list
   * names per board (activities snapshot list *names* in `toValue`), and dedupe
   * by card keeping the most recent completion. Only cards in the caller's
   * scope.
   */
  async completed(userId: string, since?: string): Promise<CompletedTasksReport> {
    const sinceDate = parseSince(since);
    const [scope, boardNames] = await Promise.all([this.scopeFor(userId), this.boardNameMap()]);

    const doneLists = await this.prisma.list.findMany({
      where: { statusCategory: "DONE" },
      select: { name: true, boardId: true },
    });
    const doneKeys = new Set(doneLists.map((l) => `${l.boardId}::${l.name}`));

    const activities = await this.prisma.cardActivity.findMany({
      where: { type: "MOVED", createdAt: { gte: sinceDate }, card: cardScopeWhere(scope) },
      orderBy: { createdAt: "desc" },
      include: {
        actor: { select: { displayName: true } },
        card: { select: { id: true, title: true, boardId: true, boardLinks: { select: { boardId: true } } } },
      },
    });

    const seen = new Set<string>();
    const tasks: CompletedTasksReport["tasks"] = [];
    for (const activity of activities) {
      if (!activity.toValue) continue;
      if (!doneKeys.has(`${activity.boardId}::${activity.toValue}`)) continue;
      if (seen.has(activity.cardId)) continue;
      seen.add(activity.cardId);
      const boardId = boardInScope(scope, activity.boardId, activity.card);
      tasks.push({
        cardId: activity.cardId,
        cardTitle: activity.card.title,
        boardId,
        boardName: boardNames.get(boardId) ?? "",
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
   * Report 3a — overdue tasks: past their due date, not archived, and not in
   * a completed (`DONE`/`CLOSED`) list (null-category/manual lists count as
   * not-done). Only cards in the caller's scope.
   */
  async overdue(userId: string): Promise<OverdueTasksReport> {
    const now = new Date();
    const [scope, boardNames] = await Promise.all([this.scopeFor(userId), this.boardNameMap()]);
    const cards = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        dueDate: { lt: now },
        // `Card` has no direct `board` relation (only the `boardId` scalar) —
        // the archived-board exclusion has to go through `list.board`.
        AND: [
          { NOT: { list: { statusCategory: { in: COMPLETED_CATEGORIES } } } },
          { list: { board: { isArchived: false } } },
          cardScopeWhere(scope),
        ],
      },
      orderBy: { dueDate: "asc" },
      include: {
        list: { select: { name: true } },
        assignees: { select: { user: { select: { displayName: true } } } },
        boardLinks: { select: { boardId: true } },
      },
    });

    const tasks = cards
      .filter((card): card is typeof card & { dueDate: Date } => card.dueDate !== null)
      .map((card) => {
        const boardId = boardInScope(scope, card.boardId, card);
        return {
          cardId: card.id,
          cardTitle: card.title,
          boardId,
          boardName: boardNames.get(boardId) ?? "",
          listName: card.list.name,
          dueDate: card.dueDate.toISOString(),
          assigneeNames: card.assignees.map((a) => a.user.displayName),
        };
      });

    return { generatedAt: now.toISOString(), total: tasks.length, tasks };
  }

  /** boardId → board name, for reports that only carry a denormalized boardId. */
  private async boardNameMap(): Promise<Map<string, string>> {
    const boards = await this.prisma.board.findMany({ select: { id: true, name: true } });
    return new Map(boards.map((b) => [b.id, b.name]));
  }

  /**
   * Report 3b — workload: for each user, how many open tasks (non-archived,
   * not in a completed `DONE`/`CLOSED` list) are assigned to them. Sorted by
   * load, heaviest first. Counts only cards in the caller's scope.
   */
  async workload(userId: string): Promise<WorkloadReport> {
    const scope = await this.scopeFor(userId);
    const assignments = await this.prisma.cardAssignee.findMany({
      where: {
        card: {
          isArchived: false,
          AND: [
            { NOT: { list: { statusCategory: { in: COMPLETED_CATEGORIES } } } },
            { list: { board: { isArchived: false } } },
            cardScopeWhere(scope),
          ],
        },
      },
      select: { userId: true, user: { select: { displayName: true, username: true, isActive: true } } },
    });

    const byUser = new Map<string, { displayName: string; username: string; isActive: boolean; openCards: number }>();
    for (const a of assignments) {
      const current = byUser.get(a.userId);
      if (current) current.openCards += 1;
      else
        byUser.set(a.userId, {
          displayName: a.user.displayName,
          username: a.user.username,
          isActive: a.user.isActive,
          openCards: 1,
        });
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
