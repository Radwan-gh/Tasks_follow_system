import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { OversightBoard, OversightTasksFilter, OversightTasksResponse, OversightUser } from "@app/types";
import { BoardsService } from "../boards/boards.service";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";
import { PrismaService } from "../prisma/prisma.service";

const PERSON = { select: { id: true, username: true, displayName: true } } as const;

/**
 * «المتابعة» — read-only, system-wide views for a supervisor (an ADMIN, or a
 * user granted `canViewAllBoards`). Like the reports section it spans every
 * board and so does not go through per-board `assertMembership`; access is
 * the system-level grant, enforced by `SupervisorGuard` (REST) or
 * `BoardsService.isSupervisor` (MCP) before any method here runs. Restricted
 * cards are included — a supervisor oversees every card.
 */
@Injectable()
export class OversightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  boardsList(archived: boolean): Promise<OversightBoard[]> {
    return this.boards.listAll(archived);
  }

  /**
   * Cards across every board, filtered and cursor-paginated. Archived cards
   * and cards in archived lists never appear; cards on archived boards appear
   * only when the query targets that board by `boardId`. Completed cards are
   * left out unless `includeCompleted` or an explicit `statusCategory` asks
   * for them. Overdue results are ordered by due date (most overdue first),
   * everything else by most recently updated.
   */
  async tasks(query: OversightTasksFilter): Promise<OversightTasksResponse> {
    // `notIn` alone would drop lists with a null category (SQL `NULL NOT IN …`).
    const notCompleted: Prisma.ListWhereInput = {
      OR: [{ statusCategory: null }, { statusCategory: { notIn: COMPLETED_CATEGORIES } }],
    };

    const and: Prisma.CardWhereInput[] = [{ isArchived: false }, { list: { isArchived: false } }];
    if (query.boardId) and.push({ boardId: query.boardId });
    else and.push({ list: { board: { isArchived: false } } });
    if (query.assigneeId) and.push({ assignees: { some: { userId: query.assigneeId } } });
    if (query.statusCategory) and.push({ list: { statusCategory: query.statusCategory } });
    else if (!query.includeCompleted || query.overdue) and.push({ list: notCompleted });
    if (query.overdue) and.push({ dueDate: { lt: new Date() } });
    if (query.dueFrom) and.push({ dueDate: { gte: new Date(query.dueFrom) } });
    if (query.dueTo) and.push({ dueDate: { lte: new Date(query.dueTo) } });
    if (query.q) and.push({ title: { contains: query.q, mode: "insensitive" } });

    const orderBy: Prisma.CardOrderByWithRelationInput[] = query.overdue
      ? [{ dueDate: "asc" }, { id: "asc" }]
      : [{ updatedAt: "desc" }, { id: "desc" }];

    const rows = await this.prisma.card.findMany({
      where: { AND: and },
      orderBy,
      // One extra row tells us whether another page exists.
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        boardId: true,
        priority: true,
        dueDate: true,
        isRestricted: true,
        updatedAt: true,
        list: { select: { name: true, statusCategory: true, board: { select: { name: true, isArchived: true } } } },
        createdBy: PERSON,
        assignees: { select: { user: PERSON } },
        subtasks: { select: { isDone: true } },
      },
    });

    const page = rows.slice(0, query.limit);
    return {
      items: page.map((card) => ({
        id: card.id,
        title: card.title,
        boardId: card.boardId,
        boardName: card.list.board.name,
        boardIsArchived: card.list.board.isArchived,
        listName: card.list.name,
        statusCategory: card.list.statusCategory,
        priority: card.priority,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        isRestricted: card.isRestricted,
        createdBy: card.createdBy,
        assignees: card.assignees.map((a) => a.user),
        subtaskTotal: card.subtasks.length,
        subtaskDone: card.subtasks.filter((s) => s.isDone).length,
        updatedAt: card.updatedAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  /** Everyone, for the tasks view's assignee filter — a supervisor need not be an ADMIN, so `/admin/users` is off limits. */
  users(): Promise<OversightUser[]> {
    return this.prisma.user.findMany({
      orderBy: { displayName: "asc" },
      select: { id: true, username: true, displayName: true, isActive: true },
    });
  }
}
