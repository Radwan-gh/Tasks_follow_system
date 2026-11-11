import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SEARCH_IGNORED_PATTERN,
  SEARCH_LETTER_FOLDS,
  findSearchMatch,
  foldForSearch,
  searchSnippet,
  type SearchCardHit,
  type SearchQuery,
  type SearchResponse,
  type SearchSubtaskHit,
} from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard } from "../boards/boards.service";

/** How many of each kind one search returns at most. */
const LIMITS = { boards: 20, cards: 50, subtasks: 50 } as const;
/**
 * Rows read before dropping restricted tasks the caller cannot open — more
 * than the limit, so a few hidden ones don't leave the list short.
 */
const OVERFETCH = 2;

const FOLD_FROM = Object.keys(SEARCH_LETTER_FOLDS).join("");
const FOLD_TO = Object.values(SEARCH_LETTER_FOLDS).join("");

/**
 * The SQL twin of `foldForSearch` (packages/types/src/search.ts): lower case,
 * tashkeel/tatweel removed, Arabic letter forms folded. Both sides of every
 * comparison go through it — the column here, the term in `foldForSearch`.
 */
function folded(column: string): Prisma.Sql {
  return Prisma.sql`translate(regexp_replace(lower(${Prisma.raw(column)}), ${SEARCH_IGNORED_PATTERN}, '', 'g'), ${FOLD_FROM}, ${FOLD_TO})`;
}

/** `LIKE` treats `%`, `_` and `\` specially; a typed term means them literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** What a task needs to be shown as a hit and access-checked, on each board it is on. */
const CARD_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  boardId: true,
  listId: true,
  createdById: true,
  isRestricted: true,
  members: { select: { userId: true } },
  list: { select: { name: true, statusCategory: true, board: { select: { name: true, ownerId: true } } } },
  boardLinks: {
    orderBy: { createdAt: "asc" },
    select: {
      boardId: true,
      list: { select: { name: true, statusCategory: true } },
      board: { select: { name: true, ownerId: true } },
    },
  },
} as const satisfies Prisma.CardSelect;
type SearchCard = Prisma.CardGetPayload<{ select: typeof CARD_SELECT }>;

function ownerIdsOf(card: SearchCard): string[] {
  return [card.list.board.ownerId, ...card.boardLinks.map((l) => l.board.ownerId)];
}

/**
 * The board a task is shown under: `scopeBoardId` inside a board, else its
 * home board when the caller is on it, else the first of its other boards
 * they are on — the same rule as «مهامي» (`MyTasksService`).
 */
function placementFor(card: SearchCard, memberOf: ReadonlySet<string>, scopeBoardId?: string) {
  const onBoard = (boardId: string) => (scopeBoardId ? boardId === scopeBoardId : memberOf.has(boardId));
  const link = onBoard(card.boardId) ? undefined : card.boardLinks.find((l) => onBoard(l.boardId));
  return link
    ? { boardId: link.boardId, boardName: link.board.name, listName: link.list.name, statusCategory: link.list.statusCategory }
    : {
        boardId: card.boardId,
        boardName: card.list.board.name,
        listName: card.list.name,
        statusCategory: card.list.statusCategory,
      };
}

/** `rows` reordered to follow `ids` — `findMany({ id: { in } })` does not keep the SQL ranking. */
function inOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => !!r);
}

/**
 * `GET /search` (docs/19-search.md). Matching runs in SQL so a large board
 * never ships its tasks to Node to be filtered; access is then checked per
 * row with the same rules as the board screen — membership of a board the
 * task is on, and `canAccessCard` for restricted tasks.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  async search(userId: string, { q, boardId }: SearchQuery): Promise<SearchResponse> {
    const term = foldForSearch(q).folded;
    const empty: SearchResponse = { query: q, boards: [], cards: [], subtasks: [], truncated: false };
    if (term.length === 0) return empty;

    // Inside one board: whoever may open it (a supervisor too, read-only).
    // Otherwise: every unarchived board the caller is a member of, like the
    // boards list itself.
    let boardIds: string[];
    let supervised = false;
    if (boardId) {
      const access = await this.boards.assertMembership(userId, boardId, "VIEWER");
      supervised = access.supervised;
      boardIds = [boardId];
    } else {
      const memberships = await this.prisma.boardMember.findMany({
        where: { userId, board: { isArchived: false } },
        select: { boardId: true },
      });
      boardIds = memberships.map((m) => m.boardId);
    }
    if (boardIds.length === 0) return empty;
    const memberOf = new Set(boardIds);
    const pattern = likePattern(term);

    // A live task (not archived, not pending deletion, in a live list) on one of `boardIds`.
    const cardOnBoards = Prisma.sql`
      c."isArchived" = false AND c."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "List" li WHERE li.id = c."listId" AND li."isArchived" = false)
      AND (c."boardId" = ANY(${boardIds}::text[])
        OR EXISTS (SELECT 1 FROM "CardBoardLink" l WHERE l."cardId" = c.id AND l."boardId" = ANY(${boardIds}::text[])))`;

    const [boardRows, cardRows, subtaskRows] = await Promise.all([
      // A board-scoped search is already inside the board: no board hits.
      boardId
        ? Promise.resolve([] as { id: string }[])
        : this.prisma.$queryRaw<{ id: string }[]>`
            SELECT b.id FROM "Board" b
            WHERE b.id = ANY(${boardIds}::text[])
              AND (${folded('b."name"')} LIKE ${pattern} OR ${folded('b."description"')} LIKE ${pattern})
            ORDER BY (${folded('b."name"')} LIKE ${pattern}) DESC, b."updatedAt" DESC
            LIMIT ${LIMITS.boards + 1}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM "Card" c
        WHERE ${cardOnBoards}
          AND (${folded('c."title"')} LIKE ${pattern} OR ${folded('c."description"')} LIKE ${pattern})
        ORDER BY (${folded('c."title"')} LIKE ${pattern}) DESC, c."updatedAt" DESC
        LIMIT ${LIMITS.cards * OVERFETCH + 1}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM "Subtask" s JOIN "Card" c ON c.id = s."cardId"
        WHERE ${cardOnBoards} AND ${folded('s."title"')} LIKE ${pattern}
        ORDER BY s."isDone" ASC, s."updatedAt" DESC
        LIMIT ${LIMITS.subtasks * OVERFETCH + 1}`,
    ]);

    const [boards, cards, subtasks] = await Promise.all([
      boardRows.length
        ? this.prisma.board.findMany({
            where: { id: { in: boardRows.map((r) => r.id) } },
            select: { id: true, name: true, description: true },
          })
        : [],
      cardRows.length
        ? this.prisma.card.findMany({ where: { id: { in: cardRows.map((r) => r.id) } }, select: CARD_SELECT })
        : [],
      subtaskRows.length
        ? this.prisma.subtask.findMany({
            where: { id: { in: subtaskRows.map((r) => r.id) } },
            select: { id: true, title: true, isDone: true, card: { select: CARD_SELECT } },
          })
        : [],
    ]);

    // A supervisor inside a board they oversee sees every task there, as on the board screen.
    const canOpen = (card: SearchCard) => supervised || canAccessCard(userId, ownerIdsOf(card), card);

    const boardHits = inOrder(
      boardRows.map((r) => r.id),
      boards,
    ).map((b) => ({
      id: b.id,
      name: b.name,
      descriptionSnippet:
        !findSearchMatch(b.name, q) && b.description ? searchSnippet(b.description, q) : null,
    }));

    const cardHits: SearchCardHit[] = inOrder(
      cardRows.map((r) => r.id),
      cards,
    )
      .filter(canOpen)
      .map((card) => ({
        id: card.id,
        title: card.title,
        ...placementFor(card, memberOf, boardId),
        priority: card.priority,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        descriptionSnippet:
          !findSearchMatch(card.title, q) && card.description ? searchSnippet(card.description, q) : null,
      }));

    const subtaskHits: SearchSubtaskHit[] = inOrder(
      subtaskRows.map((r) => r.id),
      subtasks,
    )
      .filter((s) => canOpen(s.card))
      .map((s) => {
        const placement = placementFor(s.card, memberOf, boardId);
        return {
          id: s.id,
          title: s.title,
          isDone: s.isDone,
          cardId: s.card.id,
          cardTitle: s.card.title,
          boardId: placement.boardId,
          boardName: placement.boardName,
        };
      });

    return {
      query: q,
      boards: boardHits.slice(0, LIMITS.boards),
      cards: cardHits.slice(0, LIMITS.cards),
      subtasks: subtaskHits.slice(0, LIMITS.subtasks),
      truncated:
        boardHits.length > LIMITS.boards ||
        cardHits.length > LIMITS.cards ||
        subtaskHits.length > LIMITS.subtasks ||
        cardRows.length > LIMITS.cards * OVERFETCH ||
        subtaskRows.length > LIMITS.subtasks * OVERFETCH,
    };
  }
}
