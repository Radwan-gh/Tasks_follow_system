import type { ListStatusCategory } from "@app/types";

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
