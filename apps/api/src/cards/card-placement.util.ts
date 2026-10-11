import { generateKeyBetween } from "@app/ordering";
import type { ListStatusCategory, Prisma } from "@prisma/client";

/*
 * A task can sit on several boards (docs/18-multi-board-tasks.md): its home
 * placement is the card row itself (`boardId`/`listId`/`position`), every other
 * board is a `CardBoardLink`. A board's column therefore holds two kinds of
 * rows — its own cards and the cards linked onto it — ordered together by
 * their fractional keys. Everything that reads or writes a position in a
 * column goes through these helpers, so neither kind is ever forgotten.
 */

/** Prisma client or an open transaction — the helpers run on whichever the caller holds. */
type Db = Prisma.TransactionClient;

/** How every card read that feeds `serializeCard` loads the card's other boards, oldest link first. */
export const BOARD_LINKS_INCLUDE = {
  select: { id: true, boardId: true, listId: true, position: true },
  orderBy: { createdAt: "asc" },
} as const satisfies Prisma.Card$boardLinksArgs;

/** One board a card sits on: its home (`linkId: null`, stored on the card row) or a link. */
export interface Placement {
  boardId: string;
  listId: string;
  linkId: string | null;
}

/** Every board the card is on, home first. */
export function placementsOf(card: {
  boardId: string;
  listId: string;
  boardLinks: { id: string; boardId: string; listId: string }[];
}): Placement[] {
  return [
    { boardId: card.boardId, listId: card.listId, linkId: null },
    ...card.boardLinks.map((link) => ({ boardId: link.boardId, listId: link.listId, linkId: link.id })),
  ];
}

/** The card's key within the column `listId` — as one of the column's own cards, or linked onto it. */
export async function positionInList(db: Db, cardId: string, listId: string): Promise<string | null> {
  const own = await db.card.findFirst({ where: { id: cardId, listId }, select: { position: true } });
  if (own) return own.position;
  const link = await db.cardBoardLink.findFirst({ where: { cardId, listId }, select: { position: true } });
  return link?.position ?? null;
}

/** A key after every live card in the column, its own and linked ones alike. */
export async function endOfList(db: Db, listId: string): Promise<string> {
  const [own, linked] = await Promise.all([
    db.card.findFirst({
      where: { listId, isArchived: false },
      orderBy: { position: "desc" },
      select: { position: true },
    }),
    db.cardBoardLink.findFirst({
      where: { listId, card: { isArchived: false } },
      orderBy: { position: "desc" },
      select: { position: true },
    }),
  ]);
  return generateKeyBetween(laterKey(own?.position ?? null, linked?.position ?? null), null);
}

/** The ids among `ids` that sit in the column `listId`, either way. */
export async function cardIdsInList(db: Db, ids: string[], listId: string): Promise<Set<string>> {
  const [own, linked] = await Promise.all([
    db.card.findMany({ where: { id: { in: ids }, listId }, select: { id: true } }),
    db.cardBoardLink.findMany({ where: { cardId: { in: ids }, listId }, select: { cardId: true } }),
  ]);
  return new Set([...own.map((c) => c.id), ...linked.map((l) => l.cardId)]);
}

/** Every live card in the column, in board order — what the MCP `move_card` places among. */
export async function cardIdsInColumn(db: Db, listId: string): Promise<string[]> {
  const [own, linked] = await Promise.all([
    db.card.findMany({
      where: { listId, isArchived: false },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    }),
    db.cardBoardLink.findMany({
      where: { listId, card: { isArchived: false } },
      orderBy: { position: "asc" },
      select: { cardId: true, position: true },
    }),
  ]);
  return mergeByPosition(own, linked.map((l) => ({ id: l.cardId, position: l.position }))).map((c) => c.id);
}

/**
 * The column for a status on another of the card's boards: that board's first
 * live list with the same `statusCategory`. Null when the status has no
 * category or the board has no such list (boards from before the five-status
 * template) — that board's placement then stays where it is.
 */
export async function listForStatus(
  db: Db,
  boardId: string,
  statusCategory: ListStatusCategory | null,
): Promise<{ id: string; name: string } | null> {
  if (!statusCategory) return null;
  return db.list.findFirst({
    where: { boardId, statusCategory, isArchived: false },
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });
}

/**
 * Where a task lands on a board it is newly added to: the column with its
 * status, else that board's «جديد», else its first column. `lists` are the
 * board's live lists in board order.
 */
export function columnForNewBoard<L extends { statusCategory: ListStatusCategory | null }>(
  lists: L[],
  statusCategory: ListStatusCategory | null,
): L | undefined {
  return (
    (statusCategory ? lists.find((l) => l.statusCategory === statusCategory) : undefined) ??
    lists.find((l) => l.statusCategory === "NEW") ??
    lists[0]
  );
}

/**
 * Two already position-sorted runs merged into one. Keys are base-62 ASCII, so
 * JS string order is the byte order the database sorts them in (`COLLATE "C"`).
 */
export function mergeByPosition<T extends { position: string }>(a: T[], b: T[]): T[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  const merged: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) merged.push(b[j].position < a[i].position ? b[j++] : a[i++]);
  while (i < a.length) merged.push(a[i++]);
  while (j < b.length) merged.push(b[j++]);
  return merged;
}

function laterKey(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
