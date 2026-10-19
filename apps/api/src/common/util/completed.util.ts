import type { ListStatusCategory } from "@app/types";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * The two list-status categories that count as "done" for reports,
 * my-tasks, and workload purposes. `CLOSED` ("انتهى") is a newer terminal
 * status after `DONE` ("تم التنفيذ"). Use this in Prisma `where` filters
 * (`statusCategory: { in: COMPLETED_CATEGORIES }`); use `isCompleted()` below
 * for a plain in-memory check on an already-fetched value. Every place that
 * used to check `statusCategory === "DONE"` alone must go through one of
 * these instead, or a card moved to `CLOSED` would wrongly reappear as "open".
 */
export const COMPLETED_CATEGORIES: ListStatusCategory[] = ["DONE", "CLOSED"];

export function isCompleted(category: ListStatusCategory | null): boolean {
  return category === "DONE" || category === "CLOSED";
}

interface Completion {
  cardId: string;
  createdAt: Date;
}

/**
 * Dedupe key for "tasks completed" counts: once per task *per cycle*. A
 * recurring task is one card that finishes every cycle (docs/14), so deduping
 * by card alone would count a daily task once a week. A completion belongs to
 * the cycle open when it happened — how many of the card's cycles had closed
 * strictly before it. The move that closes a cycle is stamped with that
 * cycle's exact `closedAt` (`CardsService.update`), so it counts with its own
 * cycle; a non-recurring card has no cycles and dedupes by card as before.
 */
export async function completionKeyOf(
  prisma: Pick<PrismaService, "cardCycle">,
  completions: Completion[],
): Promise<(completion: Completion) => string> {
  const cardIds = [...new Set(completions.map((c) => c.cardId))];
  const cycles =
    cardIds.length > 0
      ? await prisma.cardCycle.findMany({ where: { cardId: { in: cardIds } }, select: { cardId: true, closedAt: true } })
      : [];
  const closedAt = new Map<string, number[]>();
  for (const cycle of cycles) closedAt.set(cycle.cardId, [...(closedAt.get(cycle.cardId) ?? []), cycle.closedAt.getTime()]);
  return ({ cardId, createdAt }) =>
    `${cardId}#${(closedAt.get(cardId) ?? []).filter((t) => t < createdAt.getTime()).length}`;
}
