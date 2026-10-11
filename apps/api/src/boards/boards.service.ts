import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { canSupervise } from "@app/types";
import type { BoardRole, CardPriority, CreateBoardRequest, RecurrenceRule, UpdateBoardRequest } from "@app/types";
import { generateKeyBetween, generateNKeysBetween } from "@app/ordering";
import { PrismaService } from "../prisma/prisma.service";
import { BoardCategoriesService } from "../board-categories/board-categories.service";
import { AttachmentStorageService } from "../common/storage/attachment-storage.service";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";
import { BOARD_LINKS_INCLUDE, mergeByPosition, placementsOf } from "../cards/card-placement.util";
import { TASK_WORKFLOW_TEMPLATE } from "./board-templates";

interface BoardAggregate {
  memberCount: number;
  cardCount: number;
  doneCount: number;
  memberPreviews: { id: string; displayName: string }[];
}
const EMPTY_AGGREGATE: BoardAggregate = { memberCount: 0, cardCount: 0, doneCount: 0, memberPreviews: [] };

/** What `serializeBoard` needs of the board's category — every board read includes this. */
const CATEGORY_INCLUDE = { category: { select: { id: true, name: true } } } as const;

/**
 * What `assertMembership` granted. `supervised` is true when the caller is not
 * a member at all and was admitted read-only through oversight — read paths
 * use it to also show restricted cards, which a supervisor sees in full.
 */
export interface BoardAccess {
  role: BoardRole;
  supervised: boolean;
}

// §3c-4 "دور «مشاهد»": a viewer can read a board but not mutate anything on
// it. Every *read* call site below passes `minRole: "VIEWER"` explicitly;
// every *write* call site keeps the default `"MEMBER"` (or `"OWNER"` where
// already required) so `ROLE_RANK[VIEWER] < ROLE_RANK[MEMBER]` blocks it.
const ROLE_RANK: Record<BoardRole, number> = { VIEWER: 0, MEMBER: 1, OWNER: 2 };

/** What `assertCardAccess` loads with the card — everything the card services check and serialize. */
const CARD_ACCESS_INCLUDE = {
  members: { select: { userId: true } },
  assignees: { select: { userId: true } },
  boardLinks: BOARD_LINKS_INCLUDE,
} as const satisfies Prisma.CardInclude;
export type AccessibleCard = Prisma.CardGetPayload<{ include: typeof CARD_ACCESS_INCLUDE }>;

/** A card as the board face shows it: the counts on top of the card itself. */
const BOARD_CARD_INCLUDE = {
  members: { select: { userId: true } },
  assignees: { select: { userId: true } },
  // The board face's paperclip count and subtask fraction.
  subtasks: { select: { isDone: true } },
  _count: { select: { attachments: true } },
} as const satisfies Prisma.CardInclude;

/**
 * What `assertCardAccess` granted on a task, across every board it is on
 * (docs/18-multi-board-tasks.md): the caller's best role on any of them, and
 * the owners of all of them — each one counts as "the board owner" for the
 * task (`canAccessCard`, `canManageCard`, closing it).
 */
export interface CardAccess extends BoardAccess {
  card: AccessibleCard;
  /** Every board the card is on, home first. */
  boardIds: string[];
  ownerIds: string[];
}

/**
 * The caller's role on a task from their memberships on its boards — the
 * highest one counts. `"none"` means no membership on any of them (the
 * oversight fallback may still apply); `"archived"` that every board that
 * would allow a write is archived.
 */
export function resolveCardRole(
  memberships: { boardId: string; role: BoardRole }[],
  boards: { id: string; isArchived: boolean }[],
  minRole: BoardRole,
  mutable: boolean,
): BoardRole | "none" | "forbidden" | "archived" {
  if (memberships.length === 0) return "none";
  let qualifying = memberships.filter((m) => ROLE_RANK[m.role] >= ROLE_RANK[minRole]);
  if (qualifying.length === 0) return "forbidden";
  if (mutable) {
    const archived = new Set(boards.filter((b) => b.isArchived).map((b) => b.id));
    qualifying = qualifying.filter((m) => !archived.has(m.boardId));
    if (qualifying.length === 0) return "archived";
  }
  return qualifying.reduce((best, m) => (ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best), qualifying[0].role);
}

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AttachmentStorageService,
    private readonly categories: BoardCategoriesService,
  ) {}

  /**
   * Single source of truth for "can user X do Y on board Z", reused by
   * lists/cards services.
   *
   * Oversight («المتابعة»): a non-member who `canSupervise()` (an ADMIN, or a
   * user granted `canViewAllBoards`) is admitted as a `VIEWER` — but only when
   * the caller asked for `VIEWER`, i.e. on read paths. Every write path asks
   * for `MEMBER`/`OWNER` and so still rejects them; read-only falls out of the
   * existing role ranking rather than a separate check. A real membership
   * always wins, so a supervisor who is also a member keeps their own role.
   * Role and flag are read from the database, not the JWT, so revoking takes
   * effect on the next request.
   */
  async assertMembership(userId: string, boardId: string, minRole: BoardRole = "MEMBER"): Promise<BoardAccess> {
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (membership) {
      if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
        throw new ForbiddenException("You do not have access to this board");
      }
      return { role: membership.role, supervised: false };
    }
    if (minRole === "VIEWER" && (await this.isSupervisor(userId))) {
      return { role: "VIEWER", supervised: true };
    }
    throw new ForbiddenException("You do not have access to this board");
  }

  /** `canSupervise()` against the live database row; a deactivated account never qualifies. */
  async isSupervisor(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, canViewAllBoards: true, isActive: true },
    });
    return !!user?.isActive && canSupervise(user);
  }

  async listForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } }, isArchived: false },
      orderBy: { updatedAt: "desc" },
      include: CATEGORY_INCLUDE,
    });
    const aggregates = await this.boardAggregates(boards.map((b) => b.id));
    return boards.map((b) => serializeBoard(b, aggregates.get(b.id) ?? EMPTY_AGGREGATE));
  }

  /** The collapsed "اللوحات المؤرشفة" link on the boards list — `design-prompt-group-3.md` §3b-3. */
  async listArchivedForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } }, isArchived: true },
      orderBy: { updatedAt: "desc" },
      include: CATEGORY_INCLUDE,
    });
    const aggregates = await this.boardAggregates(boards.map((b) => b.id));
    return boards.map((b) => serializeBoard(b, aggregates.get(b.id) ?? EMPTY_AGGREGATE));
  }

  /**
   * Oversight's "كل اللوحات" — every board in the system regardless of
   * membership, with its owner. No access check here: callers sit behind
   * `SupervisorGuard` (REST) or an explicit `isSupervisor` check (MCP).
   */
  async listAll(archived: boolean) {
    const boards = await this.prisma.board.findMany({
      where: { isArchived: archived },
      orderBy: { updatedAt: "desc" },
      include: { owner: { select: { id: true, username: true, displayName: true } }, ...CATEGORY_INCLUDE },
    });
    const aggregates = await this.boardAggregates(boards.map((b) => b.id));
    return boards.map((b) => ({
      ...serializeBoard(b, aggregates.get(b.id) ?? EMPTY_AGGREGATE),
      owner: b.owner,
    }));
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

  /**
   * `assertMembership` for a task rather than a board — the single source of
   * truth for every card-scoped read and write (cards, comments, attachments,
   * subtasks). A task can sit on several boards (docs/18-multi-board-tasks.md),
   * so membership on *any* of them admits the caller, with their highest role
   * there; the oversight fallback and the "real membership wins" rule are the
   * same as `assertMembership`'s. `mutable` (every write) additionally needs
   * one of those qualifying boards to be live — an archived board stays
   * read-only, but the same task on a live board can still be worked on.
   *
   * Unless `requireCardAccess` is false, a restricted card the caller may not
   * see is a 404, exactly as before — a supervisor sees every card.
   *
   * Cost: one card read plus one board and one membership read (in
   * parallel), whatever the number of boards.
   */
  async assertCardAccess(
    userId: string,
    cardId: string,
    minRole: BoardRole = "MEMBER",
    { mutable = false, requireCardAccess = true }: { mutable?: boolean; requireCardAccess?: boolean } = {},
  ): Promise<CardAccess> {
    const card = await this.prisma.card.findUnique({ where: { id: cardId }, include: CARD_ACCESS_INCLUDE });
    if (!card) throw new NotFoundException("Card not found");
    const boardIds = placementsOf(card).map((p) => p.boardId);
    const [boards, memberships] = await Promise.all([
      this.prisma.board.findMany({
        where: { id: { in: boardIds } },
        select: { id: true, ownerId: true, isArchived: true },
      }),
      this.prisma.boardMember.findMany({
        where: { userId, boardId: { in: boardIds } },
        select: { boardId: true, role: true },
      }),
    ]);
    const ownerIds = [...new Set(boards.map((b) => b.ownerId))];

    let access: BoardAccess;
    const role = resolveCardRole(memberships, boards, minRole, mutable);
    if (role === "archived") throw new ForbiddenException("This board is archived and read-only");
    if (role === "forbidden") throw new ForbiddenException("You do not have access to this board");
    if (role === "none") {
      if (minRole !== "VIEWER" || !(await this.isSupervisor(userId))) {
        throw new ForbiddenException("You do not have access to this board");
      }
      access = { role: "VIEWER", supervised: true };
    } else {
      access = { role, supervised: false };
    }

    if (requireCardAccess && !access.supervised && !canAccessCard(userId, ownerIds, card)) {
      throw new NotFoundException("Card not found");
    }
    return { ...access, card, boardIds, ownerIds };
  }

  /** A system ADMIN, read from the database like `isSupervisor` — may change any task's boards. */
  async isActiveAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
    return !!user?.isActive && user.role === "ADMIN";
  }

  /**
   * Everyone on any of a task's boards, once each with their highest role
   * there — who may be assigned to it or given access to it, and what its
   * pickers offer (`GET /cards/:id/people`). Home board members come first.
   * `userIds` narrows the read to just those people, for validating a request.
   */
  async cardPeople(boardIds: string[], userIds?: string[]) {
    const rows = await this.prisma.boardMember.findMany({
      where: { boardId: { in: boardIds }, ...(userIds ? { userId: { in: userIds } } : {}) },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, username: true, displayName: true, isActive: true } } },
    });
    const boardOrder = new Map(boardIds.map((id, i) => [id, i]));
    rows.sort((a, b) => boardOrder.get(a.boardId)! - boardOrder.get(b.boardId)!);
    const byUser = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const current = byUser.get(row.userId);
      if (!current || ROLE_RANK[row.role] > ROLE_RANK[current.role]) byUser.set(row.userId, row);
    }
    return [...byUser.values()].map((m) => ({ userId: m.userId, boardId: m.boardId, role: m.role, user: m.user }));
  }

  /**
   * A task's details — its fields, assignees, checklist items, and the task
   * itself (archive/delete) — are edited only by its owner: the owner of any
   * board it is on, or the task's creator (`canManageCard`). Every other member
   * who can open the task may still move it, tick its sub-tasks and comment.
   * Takes what `assertCardAccess` resolved, which still decides board access.
   */
  assertCanManageCard(userId: string, access: Pick<CardAccess, "ownerIds" | "card">) {
    if (!canManageCard(userId, access.ownerIds, access.card)) {
      throw new ForbiddenException("Only the board owner or the task creator can edit this task");
    }
  }

  async create(userId: string, input: CreateBoardRequest) {
    // Seed the five status lists unless an empty board is explicitly asked for
    // — the apps never send `template`, so every board they create gets them.
    // Positions are generated in one evenly-spaced batch so the fractional
    // keys sort in order.
    const templateLists = input.template === "EMPTY" ? [] : TASK_WORKFLOW_TEMPLATE;
    const positions = generateNKeysBetween(null, null, templateLists.length);
    if (input.categoryId) await this.categories.assertExists(input.categoryId);

    const board = await this.prisma.board.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        ownerId: userId,
        categoryId: input.categoryId ?? null,
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
      include: { owner: { select: { id: true, displayName: true } }, ...CATEGORY_INCLUDE },
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

    const [memberCounts, cardCounts, doneCounts, linkedCounts, linkedDoneCounts, members] = await Promise.all([
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
      // Tasks shared onto these boards from another one count where they show
      // (docs/18-multi-board-tasks.md). In parallel with the counts above, so
      // no extra round trip whether or not anything is shared.
      this.prisma.cardBoardLink.groupBy({
        by: ["boardId"],
        where: { boardId: { in: boardIds }, card: { isArchived: false }, list: { isArchived: false } },
        _count: { _all: true },
      }),
      this.prisma.cardBoardLink.groupBy({
        by: ["boardId"],
        where: {
          boardId: { in: boardIds },
          card: { isArchived: false },
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
    for (const row of linkedCounts) result.get(row.boardId)!.cardCount += row._count._all;
    for (const row of linkedDoneCounts) result.get(row.boardId)!.doneCount += row._count._all;
    for (const row of members) {
      const previews = result.get(row.boardId)!.memberPreviews;
      if (previews.length < 4) previews.push(row.user);
    }
    return result;
  }

  /**
   * `closedSince` filters the `CLOSED`-category list to cards that entered it
   * at or after that date — the design's "«انتهى» يعرض آخر 30 يومًا فقط" with
   * a "عرض الأقدم" expansion (the client re-calls with an earlier or omitted
   * `closedSince` to load more). `hiddenClosedCount` reports how many cards
   * the filter dropped (counting only cards the caller may access, so a
   * restricted card they can't see never makes the expansion appear), letting
   * clients show "عرض الأقدم" only when there is actually something older.
   * "Entered the list" is the most recent `MOVED` activity whose `toValue` is
   * that list's name; a card with no such activity (e.g. created directly
   * into an already-`CLOSED` list) falls back to `updatedAt`. Every other
   * list is unaffected — this never filters `DONE`, `NEW`, etc.
   */
  async getDetail(userId: string, boardId: string, closedSince?: Date) {
    const access = await this.assertMembership(userId, boardId, "VIEWER");

    // Opening a board is the hottest read in the app — the mobile board polls
    // it — so tasks shared across boards (docs/18-multi-board-tasks.md) must
    // cost a board with none of them nothing: the main query is unchanged, and
    // one link read runs *alongside* it, not after it. On such a board it comes
    // back empty and nothing else is read.
    const [board, links] = await Promise.all([
      this.prisma.board.findUnique({
        where: { id: boardId },
        include: {
          ...CATEGORY_INCLUDE,
          members: { include: { user: true } },
          lists: {
            where: { isArchived: false },
            orderBy: { position: "asc" },
            include: {
              cards: { where: { isArchived: false }, orderBy: { position: "asc" }, include: BOARD_CARD_INCLUDE },
            },
          },
        },
      }),
      // Both ways round: tasks from other boards shown on this one, and the
      // other boards this board's own tasks are also on.
      this.prisma.cardBoardLink.findMany({
        where: { OR: [{ boardId }, { card: { boardId } }], card: { isArchived: false } },
        orderBy: { position: "asc" },
        select: {
          cardId: true,
          boardId: true,
          listId: true,
          position: true,
          createdAt: true,
          board: { select: { ownerId: true } },
        },
      }),
    ]);
    if (!board) throw new NotFoundException("Board not found");

    // A task's home is never also one of its links, so a link to this board is
    // a task shared onto it (already in column order), and any other link one of
    // this board's own tasks shared elsewhere (oldest first, like `placements`).
    const liveLists = new Set(board.lists.map((l) => l.id));
    const linkedHere = links.filter((l) => l.boardId === boardId && liveLists.has(l.listId));
    const homeLinks = links
      .filter((l) => l.boardId !== boardId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const closedList = closedSince ? board.lists.find((l) => l.statusCategory === "CLOSED") : undefined;
    const closedIds = closedList
      ? [
          ...closedList.cards.map((c) => c.id),
          ...linkedHere.filter((l) => l.listId === closedList.id).map((l) => l.cardId),
        ]
      : [];
    // Only a board with shared tasks reads their cards, overlapping the closed-list read.
    const [linkedCards, closedAtByCardId] = await Promise.all([
      linkedHere.length > 0
        ? this.prisma.card.findMany({
            where: { id: { in: linkedHere.map((l) => l.cardId) } },
            include: {
              ...BOARD_CARD_INCLUDE,
              list: { select: { board: { select: { ownerId: true } } } },
              boardLinks: {
                orderBy: BOARD_LINKS_INCLUDE.orderBy,
                select: { boardId: true, listId: true, board: { select: { ownerId: true } } },
              },
            },
          })
        : [],
      closedList ? this.closedAtByCardId(closedIds, closedList.name) : null,
    ]);

    // One shape for both kinds of card in a column. "The board owner" of a
    // shared task is the owner of any board it is on (`canAccessCard`).
    type Row = (typeof board.lists)[number]["cards"][number];
    type Entry = {
      card: Row;
      listId: string;
      position: string;
      ownerIds: string[];
      boardLinks: { boardId: string; listId: string }[];
    };
    const linksOfHomeCard = new Map<string, (typeof homeLinks)[number][]>();
    for (const link of homeLinks) {
      const links = linksOfHomeCard.get(link.cardId);
      if (links) links.push(link);
      else linksOfHomeCard.set(link.cardId, [link]);
    }
    const linkedById = new Map(linkedCards.map((card) => [card.id, card]));
    const linkedByList = new Map<string, Entry[]>();
    for (const link of linkedHere) {
      const card = linkedById.get(link.cardId);
      if (!card) continue;
      const entry: Entry = {
        card,
        listId: link.listId,
        position: link.position,
        ownerIds: [card.list.board.ownerId, ...card.boardLinks.map((l) => l.board.ownerId)],
        boardLinks: card.boardLinks,
      };
      const entries = linkedByList.get(link.listId);
      if (entries) entries.push(entry);
      else linkedByList.set(link.listId, [entry]);
    }
    const columns = board.lists.map((list) => {
      const own = list.cards.map((card): Entry => {
        const links = linksOfHomeCard.get(card.id) ?? [];
        return {
          card,
          listId: card.listId,
          position: card.position,
          ownerIds: links.length ? [board.ownerId, ...links.map((l) => l.board.ownerId)] : [board.ownerId],
          boardLinks: links,
        };
      });
      return { list, entries: mergeByPosition(own, linkedByList.get(list.id) ?? []) };
    });

    // Already have every non-archived list/card/member loaded above — no
    // need for the separate `boardAggregates` queries `listForUser` uses.
    const aggregate: BoardAggregate = {
      memberCount: board.members.length,
      cardCount: columns.reduce((sum, c) => sum + c.entries.length, 0),
      doneCount: columns
        .filter((c) => c.list.statusCategory && COMPLETED_CATEGORIES.includes(c.list.statusCategory))
        .reduce((sum, c) => sum + c.entries.length, 0),
      memberPreviews: board.members.slice(0, 4).map((m) => ({ id: m.user.id, displayName: m.user.displayName })),
    };

    let hiddenClosedCount = 0;
    const lists = columns.map(({ list, entries }) => {
      // Restricted cards the requesting user can't access are hidden entirely
      // — except from a supervisor, who oversees every card.
      const accessible = access.supervised
        ? entries
        : entries.filter((e) => canAccessCard(userId, e.ownerIds, e.card));
      const visible =
        list.id === closedList?.id && closedAtByCardId
          ? accessible.filter((e) => (closedAtByCardId.get(e.card.id) ?? e.card.updatedAt) >= closedSince!)
          : accessible;
      if (list.id === closedList?.id) hiddenClosedCount = accessible.length - visible.length;
      return {
        id: list.id,
        boardId: list.boardId,
        name: list.name,
        position: list.position,
        isArchived: list.isArchived,
        statusCategory: list.statusCategory,
        createdAt: list.createdAt.toISOString(),
        cards: visible.map(({ card, listId, position, boardLinks }) => ({
          ...serializeCard({ ...card, boardLinks }),
          // A shared task's place on *this* board; `placements` still says where it sits everywhere.
          listId,
          position,
          subtaskTotal: card.subtasks.length,
          subtaskDone: card.subtasks.filter((s) => s.isDone).length,
          attachmentCount: card._count.attachments,
        })),
      };
    });

    return {
      ...serializeBoard(board, aggregate),
      hiddenClosedCount,
      supervised: access.supervised,
      members: board.members.map((m) => ({
        userId: m.userId,
        boardId: m.boardId,
        role: m.role,
        user: { id: m.user.id, username: m.user.username, displayName: m.user.displayName, isActive: m.user.isActive },
      })),
      lists,
    };
  }

  /** card id → when it most recently entered the closed list, per its `CardActivity` MOVED trail. */
  private async closedAtByCardId(cardIds: string[], closedListName: string) {
    if (cardIds.length === 0) return new Map<string, Date>();
    const moves = await this.prisma.cardActivity.findMany({
      where: { cardId: { in: cardIds }, type: "MOVED", toValue: closedListName },
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
    // Re-filing a board is an ordinary edit, like renaming it — any member may.
    if (input.categoryId) await this.categories.assertExists(input.categoryId);

    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: {
        name: input.name,
        description: input.description,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        isArchived: input.isArchived,
        categoryId: input.categoryId,
      },
      include: CATEGORY_INCLUDE,
    });
    const aggregates = await this.boardAggregates([boardId]);
    return serializeBoard(board, aggregates.get(boardId) ?? EMPTY_AGGREGATE);
  }

  /**
   * Permanent delete — only reachable *after* archiving, so archive is always
   * the reversible first step and a live board can't be wiped in one click.
   * Lists/cards/activity/members cascade in the database; notifications only
   * hold a plain `boardId` (no FK), so they're removed in the same transaction
   * rather than left pointing at a board that no longer opens. Attachment
   * bytes live outside the database and are cleared best-effort afterwards.
   */
  async remove(userId: string, boardId: string) {
    await this.assertMembership(userId, boardId, "OWNER");
    const board = await this.prisma.board.findUnique({ where: { id: boardId }, select: { isArchived: true } });
    if (!board) throw new NotFoundException("Board not found");
    if (!board.isArchived) throw new ConflictException("Archive the board before deleting it");

    // A task that also sits on other boards outlives this one: it moves home to
    // its oldest other board (docs/18-multi-board-tasks.md) instead of going
    // down with this board's lists.
    const shared = await this.prisma.card.findMany({
      where: { boardId, boardLinks: { some: {} } },
      select: { id: true, boardLinks: { ...BOARD_LINKS_INCLUDE, take: 1 } },
    });
    const attachments = await this.prisma.attachment.findMany({
      where: { card: { boardId, boardLinks: { none: {} } } },
      select: { filename: true },
    });
    await this.prisma.$transaction([
      ...shared.flatMap(({ id, boardLinks: [link] }) => [
        this.prisma.card.update({
          where: { id },
          data: { boardId: link.boardId, listId: link.listId, position: link.position },
        }),
        this.prisma.cardBoardLink.delete({ where: { id: link.id } }),
      ]),
      this.prisma.notification.deleteMany({ where: { boardId } }),
      this.prisma.board.delete({ where: { id: boardId } }),
    ]);
    await Promise.all(attachments.map((a) => this.storage.remove(a.filename)));
  }

  /**
   * Owner-only directory lookup behind the "add member" search box in both
   * apps. Matches on username or display name. Same authorization as
   * `addMember` itself (`assertMembership(..., "OWNER")`), so it never widens
   * who can see the user directory.
   *
   * This is now the *only* way to find someone to add: `addMember` takes a
   * `userId`, which the caller gets from these rows.
   *
   * Already-members are excluded so every row returned is actually addable,
   * and so are deactivated users — `addMember` rejects them, so offering one
   * could only produce a failed request.
   */
  async listMemberCandidates(
    userId: string,
    boardId: string,
    { search, limit }: { search?: string; limit: number },
  ) {
    await this.assertMembership(userId, boardId, "OWNER");

    const term = search?.trim();
    const where: Prisma.UserWhereInput = {
      isActive: true,
      boardMemberships: { none: { boardId } },
      ...(term
        ? {
            OR: [
              { username: { contains: term, mode: "insensitive" as const } },
              { displayName: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    // Fetch one extra row to tell "exactly `limit` matches" from "more than
    // `limit`" without a second COUNT query.
    const rows = await this.prisma.user.findMany({
      where,
      select: { id: true, username: true, displayName: true, isActive: true },
      orderBy: { displayName: "asc" },
      take: limit + 1,
    });

    return { users: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  async addMember(userId: string, boardId: string, targetUserId: string, role: "MEMBER" | "VIEWER" = "MEMBER") {
    await this.assertMembership(userId, boardId, "OWNER");

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException("No such user");
    // A deactivated account can neither sign in nor be given work, so it never
    // joins a board. Memberships that predate a deactivation are left alone —
    // only new ones are blocked.
    if (!target.isActive) throw new BadRequestException("Cannot add a deactivated user to a board");

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
        username: member.user.username,
        displayName: member.user.displayName,
        isActive: member.user.isActive,
      },
    };
  }

  /**
   * Full replace of the board's member set — what the auto-saving people
   * picker sends on every add/remove, mirroring card assignees. Newcomers join
   * as `MEMBER`; members who stay keep their role; the owner is always kept.
   * A removed member also loses their per-card access rows, as in
   * `removeMember`. Returns the resulting member list.
   */
  async setMembers(userId: string, boardId: string, userIds: string[]) {
    await this.assertMembership(userId, boardId, "OWNER");

    const current = await this.prisma.boardMember.findMany({
      where: { boardId },
      select: { userId: true, role: true },
    });
    const wanted = new Set(userIds);
    const currentIds = new Set(current.map((m) => m.userId));
    const toAdd = [...wanted].filter((id) => !currentIds.has(id));
    const toRemove = current.filter((m) => m.role !== "OWNER" && !wanted.has(m.userId)).map((m) => m.userId);

    if (toAdd.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: toAdd } },
        select: { id: true, isActive: true },
      });
      if (users.length !== toAdd.length) throw new NotFoundException("No such user");
      // Same rule as `addMember`: only *new* memberships are blocked for a
      // deactivated account; one deactivated after joining can stay.
      if (users.some((u) => !u.isActive)) throw new BadRequestException("Cannot add a deactivated user to a board");
    }

    const dropCardAccess = await this.cardAccessDropsOnLeave(boardId, toRemove);
    await this.prisma.$transaction([
      ...dropCardAccess,
      this.prisma.boardMember.deleteMany({ where: { boardId, userId: { in: toRemove } } }),
      this.prisma.boardMember.createMany({ data: toAdd.map((id) => ({ boardId, userId: id, role: "MEMBER" as const })) }),
    ]);

    const members = await this.prisma.boardMember.findMany({
      where: { boardId },
      include: { user: { select: { id: true, username: true, displayName: true, isActive: true } } },
    });
    return members.map((m) => ({ userId: m.userId, boardId: m.boardId, role: m.role, user: m.user }));
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
        username: member.user.username,
        displayName: member.user.displayName,
        isActive: member.user.isActive,
      },
    };
  }

  /**
   * Removing someone else is the owner's call; removing yourself is leaving,
   * which any member or viewer may do — also on an archived board, since
   * leaving is how they get it off their list. The owner can't leave: the
   * board would be left without one, so they archive or delete it instead.
   */
  async removeMember(userId: string, boardId: string, targetUserId: string) {
    const leaving = targetUserId === userId;
    await this.assertMembership(userId, boardId, leaving ? "VIEWER" : "OWNER");

    const target = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException("Membership not found");
    if (target.role === "OWNER") {
      throw new BadRequestException(
        leaving ? "The board owner cannot leave the board; archive or delete it instead" : "Cannot remove the board owner",
      );
    }

    const dropCardAccess = await this.cardAccessDropsOnLeave(boardId, [targetUserId]);
    await this.prisma.$transaction([
      ...dropCardAccess,
      this.prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId: targetUserId } } }),
    ]);
  }

  /**
   * The per-card access rows that go when `userIds` leave `boardId`: theirs on
   * every task shown on this board — its own or shared onto it — except a task
   * that is also on another board they are still on, where the access still
   * means something (docs/18-multi-board-tasks.md).
   */
  private async cardAccessDropsOnLeave(boardId: string, userIds: string[]) {
    if (userIds.length === 0) return [];
    const remaining = await this.prisma.boardMember.findMany({
      where: { userId: { in: userIds }, boardId: { not: boardId } },
      select: { userId: true, boardId: true },
    });
    return userIds.map((userId) => {
      const stillOn = remaining.filter((m) => m.userId === userId).map((m) => m.boardId);
      return this.prisma.cardMember.deleteMany({
        where: {
          userId,
          card: {
            OR: [{ boardId }, { boardLinks: { some: { boardId } } }],
            // Prisma's `NOT: [...]`: none of these may hold.
            NOT: stillOn.length
              ? [{ boardId: { in: stillOn } }, { boardLinks: { some: { boardId: { in: stillOn } } } }]
              : undefined,
          },
        },
      });
    });
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
    category: { id: string; name: string } | null;
  },
  aggregate: BoardAggregate,
) {
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    category: board.category,
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
  /**
   * The card's other boards, oldest first (`BOARD_LINKS_INCLUDE`). Required so
   * no card is ever serialized as if it were on its home board alone — pass
   * `[]` for a card that has just been created.
   */
  boardLinks: { boardId: string; listId: string }[];
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
    placements: [
      { boardId: card.boardId, listId: card.listId },
      ...card.boardLinks.map((l) => ({ boardId: l.boardId, listId: l.listId })),
    ],
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

/**
 * Whether `userId` may see/open/edit a card. Open cards are visible to every
 * board member; restricted cards only to their explicit members, plus the
 * board owner and the card creator (who can also manage access). A task on
 * several boards has several board owners — `ownerIds` is all of them.
 */
function canAccessCard(
  userId: string,
  ownerIds: readonly string[],
  card: { createdById: string; isRestricted: boolean; members?: { userId: string }[] },
): boolean {
  if (!card.isRestricted) return true;
  if (ownerIds.includes(userId) || card.createdById === userId) return true;
  return (card.members ?? []).some((m) => m.userId === userId);
}

/**
 * Whether `userId` owns a card — the owner of any board it is on, or its
 * creator — and so may edit its details and access config
 * (`BoardsService.assertCanManageCard`).
 */
function canManageCard(userId: string, ownerIds: readonly string[], card: { createdById: string }): boolean {
  return ownerIds.includes(userId) || card.createdById === userId;
}

export { serializeCard, canAccessCard, canManageCard };
