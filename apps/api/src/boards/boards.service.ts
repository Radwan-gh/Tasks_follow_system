import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { BoardRole, CardPriority, CreateBoardRequest, RecurrenceRule, UpdateBoardRequest } from "@app/types";
import { generateKeyBetween, generateNKeysBetween } from "@app/ordering";
import { PrismaService } from "../prisma/prisma.service";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";
import { TASK_WORKFLOW_TEMPLATE } from "./board-templates";

interface BoardAggregate {
  memberCount: number;
  cardCount: number;
  doneCount: number;
  memberPreviews: { id: string; displayName: string }[];
}
const EMPTY_AGGREGATE: BoardAggregate = { memberCount: 0, cardCount: 0, doneCount: 0, memberPreviews: [] };

// §3c-4 "دور «مشاهد»": a viewer can read a board but not mutate anything on
// it. Every *read* call site below passes `minRole: "VIEWER"` explicitly;
// every *write* call site keeps the default `"MEMBER"` (or `"OWNER"` where
// already required) so `ROLE_RANK[VIEWER] < ROLE_RANK[MEMBER]` blocks it.
const ROLE_RANK: Record<BoardRole, number> = { VIEWER: 0, MEMBER: 1, OWNER: 2 };

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Single source of truth for "can user X do Y on board Z", reused by lists/cards services. */
  async assertMembership(userId: string, boardId: string, minRole: BoardRole = "MEMBER") {
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException("You do not have access to this board");
    }
    return membership;
  }

  async listForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } }, isArchived: false },
      orderBy: { updatedAt: "desc" },
    });
    const aggregates = await this.boardAggregates(boards.map((b) => b.id));
    return boards.map((b) => serializeBoard(b, aggregates.get(b.id) ?? EMPTY_AGGREGATE));
  }

  /** The collapsed "اللوحات المؤرشفة" link on the boards list — `design-prompt-group-3.md` §3b-3. */
  async listArchivedForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } }, isArchived: true },
      orderBy: { updatedAt: "desc" },
    });
    const aggregates = await this.boardAggregates(boards.map((b) => b.id));
    return boards.map((b) => serializeBoard(b, aggregates.get(b.id) ?? EMPTY_AGGREGATE));
  }

  /**
   * Guards every list/card/subtask/comment/attachment *mutation* against an
   * archived board — `design-prompt-group-3.md` §3b-3: "تصبح [اللوحة]
   * للقراءة فقط". Never called from a read path (`getDetail`, `list*`, etc.),
   * which must keep working on an archived board.
   */
  async assertBoardMutable(boardId: string) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId }, select: { isArchived: true } });
    if (!board) throw new NotFoundException("Board not found");
    if (board.isArchived) throw new ForbiddenException("This board is archived and read-only");
  }

  async create(userId: string, input: CreateBoardRequest) {
    // Seed the five status lists when the task-workflow template is chosen;
    // otherwise the board starts empty (historical default). Positions are
    // generated in one evenly-spaced batch so the fractional keys sort in order.
    const templateLists = input.template === "TASK_WORKFLOW" ? TASK_WORKFLOW_TEMPLATE : [];
    const positions = generateNKeysBetween(null, null, templateLists.length);

    const board = await this.prisma.board.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
        lists: templateLists.length
          ? {
              create: templateLists.map((list, i) => ({
                name: list.name,
                statusCategory: list.statusCategory,
                position: positions[i],
              })),
            }
          : undefined,
      },
      include: { owner: { select: { id: true, displayName: true } } },
    });
    // A brand-new board always has exactly one member (the owner) and zero
    // cards — no need to round-trip through `boardAggregates` for this.
    return serializeBoard(board, {
      memberCount: 1,
      cardCount: 0,
      doneCount: 0,
      memberPreviews: [board.owner],
    });
  }

  /**
   * Batch aggregates for the boards-list card: member count, card count,
   * completed count, and a few members for the overlapping-avatars preview.
   * One `groupBy` per count across every board at once — never a per-board
   * query loop. Boards with zero matching rows (e.g. no cards yet) are
   * simply absent from a `groupBy` result, so callers must default via
   * `EMPTY_AGGREGATE` for any id missing from the returned map.
   */
  private async boardAggregates(boardIds: string[]): Promise<Map<string, BoardAggregate>> {
    if (boardIds.length === 0) return new Map();

    const [memberCounts, cardCounts, doneCounts, members] = await Promise.all([
      this.prisma.boardMember.groupBy({ by: ["boardId"], where: { boardId: { in: boardIds } }, _count: { _all: true } }),
      this.prisma.card.groupBy({
        by: ["boardId"],
        where: { boardId: { in: boardIds }, isArchived: false, list: { isArchived: false } },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ["boardId"],
        where: {
          boardId: { in: boardIds },
          isArchived: false,
          list: { isArchived: false, statusCategory: { in: COMPLETED_CATEGORIES } },
        },
        _count: { _all: true },
      }),
      // No per-group LIMIT in Prisma's query builder — fetch every member and
      // truncate to the first few per board in JS. Board membership is small
      // (a handful of people), so this stays cheap.
      this.prisma.boardMember.findMany({
        where: { boardId: { in: boardIds } },
        orderBy: { joinedAt: "asc" },
        select: { boardId: true, user: { select: { id: true, displayName: true } } },
      }),
    ]);

    const result = new Map<string, BoardAggregate>();
    for (const id of boardIds) result.set(id, { ...EMPTY_AGGREGATE, memberPreviews: [] });
    for (const row of memberCounts) result.get(row.boardId)!.memberCount = row._count._all;
    for (const row of cardCounts) result.get(row.boardId)!.cardCount = row._count._all;
    for (const row of doneCounts) result.get(row.boardId)!.doneCount = row._count._all;
    for (const row of members) {
      const previews = result.get(row.boardId)!.memberPreviews;
      if (previews.length < 4) previews.push(row.user);
    }
    return result;
  }

  /**
   * `closedSince` filters the `CLOSED`-category list to cards that entered it
   * at or after that date — the design's "«انتهى» يعرض آخر 30 يومًا فقط" with
   * a "عرض الأقدم" expansion (the mobile client re-calls with an earlier or
   * omitted `closedSince` to load more; there's no separate "how many are
   * hidden" count, so the button is shown whenever the list is `CLOSED`
   * rather than computed exactly — a deliberate simplification). "Entered
   * the list" is the most recent `MOVED` activity whose `toValue` is that
   * list's name; a card with no such activity (e.g. created directly into an
   * already-`CLOSED` list) falls back to `updatedAt`. Every other list is
   * unaffected — this never filters `DONE`, `NEW`, etc.
   */
  async getDetail(userId: string, boardId: string, closedSince?: Date) {
    await this.assertMembership(userId, boardId, "VIEWER");

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        members: { include: { user: true } },
        lists: {
          where: { isArchived: false },
          orderBy: { position: "asc" },
          include: {
            cards: {
              where: { isArchived: false },
              orderBy: { position: "asc" },
              include: {
                members: { select: { userId: true } },
                assignees: { select: { userId: true } },
              },
            },
          },
        },
      },
    });
    if (!board) throw new NotFoundException("Board not found");

    // Already have every non-archived list/card/member loaded above — no
    // need for the separate `boardAggregates` queries `listForUser` uses.
    const allCards = board.lists.flatMap((l) => l.cards);
    const aggregate: BoardAggregate = {
      memberCount: board.members.length,
      cardCount: allCards.length,
      doneCount: board.lists
        .filter((l) => l.statusCategory && COMPLETED_CATEGORIES.includes(l.statusCategory))
        .reduce((sum, l) => sum + l.cards.length, 0),
      memberPreviews: board.members.slice(0, 4).map((m) => ({ id: m.user.id, displayName: m.user.displayName })),
    };

    const closedList = closedSince ? board.lists.find((l) => l.statusCategory === "CLOSED") : undefined;
    const closedAtByCardId = closedList ? await this.closedAtByCardId(closedList) : null;

    return {
      ...serializeBoard(board, aggregate),
      members: board.members.map((m) => ({
        userId: m.userId,
        boardId: m.boardId,
        role: m.role,
        user: { id: m.user.id, email: m.user.email, displayName: m.user.displayName, isActive: m.user.isActive },
      })),
      lists: board.lists.map((list) => ({
        id: list.id,
        boardId: list.boardId,
        name: list.name,
        position: list.position,
        isArchived: list.isArchived,
        statusCategory: list.statusCategory,
        createdAt: list.createdAt.toISOString(),
        cards: list.cards
          // Restricted cards the requesting user can't access are hidden entirely.
          .filter((card) => canAccessCard(userId, board.ownerId, card))
          .filter((card) => {
            if (list.id !== closedList?.id || !closedAtByCardId) return true;
            const closedAt = closedAtByCardId.get(card.id) ?? card.updatedAt;
            return closedAt >= closedSince!;
          })
          .map(serializeCard),
      })),
    };
  }

  /** card id → when it most recently entered `closedList`, per its `CardActivity` MOVED trail. */
  private async closedAtByCardId(closedList: { id: string; name: string; cards: { id: string }[] }) {
    if (closedList.cards.length === 0) return new Map<string, Date>();
    const moves = await this.prisma.cardActivity.findMany({
      where: { cardId: { in: closedList.cards.map((c) => c.id) }, type: "MOVED", toValue: closedList.name },
      orderBy: { createdAt: "desc" },
      select: { cardId: true, createdAt: true },
    });
    const result = new Map<string, Date>();
    // Ordered newest-first, so the first entry seen per card is its most recent move.
    for (const move of moves) if (!result.has(move.cardId)) result.set(move.cardId, move.createdAt);
    return result;
  }

  async update(userId: string, boardId: string, input: UpdateBoardRequest) {
    const requiresOwner = input.isArchived !== undefined;
    await this.assertMembership(userId, boardId, requiresOwner ? "OWNER" : "MEMBER");

    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: {
        name: input.name,
        description: input.description,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        isArchived: input.isArchived,
      },
    });
    const aggregates = await this.boardAggregates([boardId]);
    return serializeBoard(board, aggregates.get(boardId) ?? EMPTY_AGGREGATE);
  }

  async remove(userId: string, boardId: string) {
    await this.assertMembership(userId, boardId, "OWNER");
    await this.prisma.board.delete({ where: { id: boardId } });
  }

  async addMember(userId: string, boardId: string, email: string, role: "MEMBER" | "VIEWER" = "MEMBER") {
    await this.assertMembership(userId, boardId, "OWNER");

    const target = await this.prisma.user.findUnique({ where: { email } });
    if (!target) throw new NotFoundException("No user with that email");

    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: target.id } },
    });
    if (existing) throw new BadRequestException("User is already a member of this board");

    const member = await this.prisma.boardMember.create({
      data: { boardId, userId: target.id, role },
      include: { user: true },
    });
    return {
      userId: member.userId,
      boardId: member.boardId,
      role: member.role,
      user: {
        id: member.user.id,
        email: member.user.email,
        displayName: member.user.displayName,
        isActive: member.user.isActive,
      },
    };
  }

  /** §3c-4: owner-only switch between `MEMBER` and `VIEWER` for an existing member. Never touches the owner's own row. */
  async updateMemberRole(userId: string, boardId: string, targetUserId: string, role: "MEMBER" | "VIEWER") {
    await this.assertMembership(userId, boardId, "OWNER");

    const target = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException("Membership not found");
    if (target.role === "OWNER") throw new BadRequestException("Cannot change the board owner's role");

    const member = await this.prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      data: { role },
      include: { user: true },
    });
    return {
      userId: member.userId,
      boardId: member.boardId,
      role: member.role,
      user: {
        id: member.user.id,
        email: member.user.email,
        displayName: member.user.displayName,
        isActive: member.user.isActive,
      },
    };
  }

  async removeMember(userId: string, boardId: string, targetUserId: string) {
    await this.assertMembership(userId, boardId, "OWNER");

    const target = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException("Membership not found");
    if (target.role === "OWNER") throw new BadRequestException("Cannot remove the board owner");

    await this.prisma.$transaction([
      // Drop any per-card access the user held on this board's cards.
      this.prisma.cardMember.deleteMany({ where: { userId: targetUserId, card: { boardId } } }),
      this.prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId: targetUserId } } }),
    ]);
  }

  /**
   * Report 3b-5 — a single-board summary for its owner, sparing them a trip
   * to the admin-only reports section (`design-prompt-group-3.md` §3b-5):
   * completed-last-7-days, overdue count, a top-3-plus-rest workload split,
   * and this month's total cost (only when at least one card has a cost).
   */
  async summary(userId: string, boardId: string) {
    await this.assertMembership(userId, boardId, "OWNER");

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const completedListNames = new Set(await this.completedListNames(boardId));
    const moves = await this.prisma.cardActivity.findMany({
      where: { boardId, type: "MOVED", createdAt: { gte: weekAgo }, card: { isArchived: false } },
      orderBy: { createdAt: "desc" },
      select: { cardId: true, toValue: true },
    });
    // Dedupe by card: a card moved into/out of a done list more than once in
    // the window must still count once (same as `ReportsService.completed`).
    const completedCardIds = new Set<string>();
    for (const move of moves) {
      if (move.toValue && completedListNames.has(move.toValue)) completedCardIds.add(move.cardId);
    }
    const completedLast7Days = completedCardIds.size;

    const overdueCount = await this.prisma.card.count({
      where: {
        boardId,
        isArchived: false,
        dueDate: { lt: now },
        NOT: { list: { statusCategory: { in: COMPLETED_CATEGORIES } } },
      },
    });

    const assignments = await this.prisma.cardAssignee.findMany({
      where: {
        card: { boardId, isArchived: false, NOT: { list: { statusCategory: { in: COMPLETED_CATEGORIES } } } },
      },
      select: { userId: true, user: { select: { displayName: true } } },
    });
    const byUser = new Map<string, { displayName: string; openCards: number }>();
    for (const a of assignments) {
      const current = byUser.get(a.userId);
      if (current) current.openCards += 1;
      else byUser.set(a.userId, { displayName: a.user.displayName, openCards: 1 });
    }
    const workload = [...byUser.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((x, y) => y.openCards - x.openCards);

    const costRows = await this.prisma.card.findMany({
      where: { boardId, isArchived: false, costAmount: { not: null }, createdAt: { gte: monthStart } },
      select: { costAmount: true },
    });
    const costThisMonth =
      costRows.length === 0
        ? null
        : costRows.reduce((sum, c) => sum + Number(c.costAmount), 0).toFixed(2);

    return {
      completedLast7Days,
      overdueCount,
      workload: workload.slice(0, 3),
      workloadRestCount: Math.max(0, workload.length - 3),
      costThisMonth,
    };
  }

  /** List names on `boardId` whose category counts as "done" — see `COMPLETED_CATEGORIES`. */
  private async completedListNames(boardId: string): Promise<string[]> {
    const lists = await this.prisma.list.findMany({
      where: { boardId, statusCategory: { in: COMPLETED_CATEGORIES } },
      select: { name: true },
    });
    return lists.map((l) => l.name);
  }

  /** Fresh-read helper for list ordering — used by ListsService when creating/moving lists. */
  async nextListPosition(boardId: string): Promise<string> {
    const last = await this.prisma.list.findFirst({
      where: { boardId, isArchived: false },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return generateKeyBetween(last?.position ?? null, null);
  }
}

function serializeBoard(
  board: {
    id: string;
    name: string;
    description: string | null;
    dueDate: Date | null;
    ownerId: string;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  aggregate: BoardAggregate,
) {
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    dueDate: board.dueDate ? board.dueDate.toISOString() : null,
    ownerId: board.ownerId,
    isArchived: board.isArchived,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
    memberCount: aggregate.memberCount,
    cardCount: aggregate.cardCount,
    doneCount: aggregate.doneCount,
    memberPreviews: aggregate.memberPreviews,
  };
}

interface CardWithMembers {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description: string | null;
  position: string;
  dueDate: Date | null;
  dueDateHasTime: boolean;
  createdById: string;
  isArchived: boolean;
  isRestricted: boolean;
  priority: CardPriority;
  costAmount: Prisma.Decimal | null;
  costNote: string | null;
  recurrence: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  members?: { userId: string }[];
  assignees?: { userId: string }[];
}

function serializeCard(card: CardWithMembers) {
  return {
    id: card.id,
    listId: card.listId,
    boardId: card.boardId,
    title: card.title,
    description: card.description,
    position: card.position,
    dueDate: card.dueDate ? card.dueDate.toISOString() : null,
    dueDateHasTime: card.dueDateHasTime,
    createdById: card.createdById,
    isArchived: card.isArchived,
    isRestricted: card.isRestricted,
    memberIds: (card.members ?? []).map((m) => m.userId),
    assigneeIds: (card.assignees ?? []).map((a) => a.userId),
    priority: card.priority,
    costAmount: card.costAmount ? card.costAmount.toString() : null,
    costNote: card.costNote,
    recurrence: (card.recurrence as RecurrenceRule | null) ?? null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

/**
 * Whether `userId` may see/open/edit a card. Open cards are visible to every
 * board member; restricted cards only to their explicit members, plus the
 * board owner and the card creator (who can also manage access).
 */
function canAccessCard(
  userId: string,
  boardOwnerId: string,
  card: { createdById: string; isRestricted: boolean; members?: { userId: string }[] },
): boolean {
  if (!card.isRestricted) return true;
  if (boardOwnerId === userId || card.createdById === userId) return true;
  return (card.members ?? []).some((m) => m.userId === userId);
}

/** Whether `userId` may change a card's access config: board owner or creator. */
function canManageCard(userId: string, boardOwnerId: string, card: { createdById: string }): boolean {
  return boardOwnerId === userId || card.createdById === userId;
}

export { serializeCard, canAccessCard, canManageCard };
