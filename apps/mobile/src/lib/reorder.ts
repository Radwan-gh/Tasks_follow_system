/**
 * Ordering math for dragging a card on the board screen (design §5c,
 * «نفس الحركة في عرض اللوحة»). Kept free of React Native imports — and of the
 * `@/` alias — so it can be unit-tested on its own (`reorder.test.ts`).
 *
 * A column *shows* its cards urgent-first (`sortByPriority`), but the server
 * orders them by `position` alone. A drag therefore only ever reorders a card
 * inside its own priority group, and the neighbours sent to
 * `PATCH /cards/:id { move: { beforeId, afterId } }` are picked from the raw
 * server order — not the order on screen — so the new key lands exactly where
 * the card was dropped once the column is sorted for display again.
 */

interface OrderedCard {
  id: string;
  priority: string;
  /** The fractional-index key; `""` on a still-optimistic (`temp:`) card. */
  position: string;
}

export const isUrgent = (card: { priority: string }) => card.priority === "URGENT";

/** «العاجل أولاً، ثم الباقي بترتيبه اليدوي» (§3b-1) — a stable sort, so ties keep their server (position) order. */
export function sortByPriority<T extends { priority: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => (isUrgent(b) ? 1 : 0) - (isUrgent(a) ? 1 : 0));
}

/**
 * The display slots — in the column *without* the dragged card — that a card
 * of the given priority may take: urgent cards stay in the band at the top,
 * everything else below it. `end` is inclusive (dropping after the last card).
 */
export function groupSlotRange(others: readonly { priority: string }[], urgent: boolean): { start: number; end: number } {
  const urgentCount = others.filter(isUrgent).length;
  return urgent ? { start: 0, end: urgentCount } : { start: urgentCount, end: others.length };
}

/** How many of the (ascending) card midpoints the dragged card's centre has passed — its display slot. */
export function slotFromCenter(midpoints: readonly number[], centerY: number): number {
  let slot = 0;
  while (slot < midpoints.length && midpoints[slot]! < centerY) slot++;
  return slot;
}

export interface DropPlan {
  /** Insert index into the target list's raw (server-order) cards, once the dragged card is taken out. */
  rawIndex: number;
  /** Neighbours to anchor to; `undefined` when there are none, so the server simply appends. */
  move?: { beforeId: string | null; afterId: string | null };
  /** 1-based place in the column as shown, for «أُفلت إلى الموضع N». */
  displayPosition: number;
  /** Dropped back where it already was: send nothing. */
  unchanged: boolean;
}

/**
 * Where a card dropped at `displaySlot` of a column goes. `raw` is the target
 * list's cards in server order (it may or may not contain the dragged card);
 * `displaySlot` counts the column as shown without the dragged card, and is
 * clamped into the card's own priority group.
 */
export function planDrop(raw: readonly OrderedCard[], dragged: { id: string; priority: string }, displaySlot: number): DropPlan {
  const urgent = isUrgent(dragged);
  const others = raw.filter((c) => c.id !== dragged.id);
  const group = others.filter((c) => isUrgent(c) === urgent);
  const { start } = groupSlotRange(others, urgent);
  const k = Math.min(Math.max(displaySlot - start, 0), group.length);

  let rawIndex: number;
  if (k < group.length) rawIndex = others.indexOf(group[k]!);
  else if (group.length > 0) rawIndex = others.indexOf(group[group.length - 1]!) + 1;
  else rawIndex = urgent ? 0 : others.length;

  // A still-optimistic neighbour has no server id (or key) to anchor to.
  const isReal = (c: OrderedCard) => !c.id.startsWith("temp:");
  let before: OrderedCard | null = null;
  for (let i = rawIndex - 1; i >= 0 && !before; i--) if (isReal(others[i]!)) before = others[i]!;
  let after: OrderedCard | null = null;
  for (let i = rawIndex; i < others.length && !after; i++) if (isReal(others[i]!)) after = others[i]!;
  // Keys are not unique in the schema, and the cache can be a poll behind: a
  // pair that isn't strictly ascending would make the server's key generator
  // throw. Anchoring to the card above alone still lands it right after it.
  if (before && after && !(before.position < after.position)) after = null;

  const ownGroup = raw.filter((c) => isUrgent(c) === urgent);
  const currentIndex = ownGroup.findIndex((c) => c.id === dragged.id);

  return {
    rawIndex,
    move: before || after ? { beforeId: before?.id ?? null, afterId: after?.id ?? null } : undefined,
    displayPosition: start + k + 1,
    unchanged: currentIndex !== -1 && currentIndex === k,
  };
}
