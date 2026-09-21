import type { Card } from "@app/types";

export interface CardFilters {
  query: string;
  myTasksOnly: boolean;
  urgentOnly: boolean;
  memberId: string | null;
}

export const EMPTY_FILTERS: CardFilters = { query: "", myTasksOnly: false, urgentOnly: false, memberId: null };

export function hasActiveFilters(filters: CardFilters): boolean {
  return Boolean(filters.query.trim()) || filters.myTasksOnly || filters.urgentOnly || Boolean(filters.memberId);
}

export function activeFilterCount(filters: CardFilters): number {
  return [filters.myTasksOnly, filters.urgentOnly, Boolean(filters.memberId)].filter(Boolean).length;
}

/**
 * All filtering here is client-side over the already-fetched board payload —
 * no `q=`/filter query params exist on `GET /boards/:id` server-side, and
 * this matches how `apps/mobile` filters its own already-loaded board data.
 */
export function matchesFilters(card: Card, filters: CardFilters, currentUserId: string): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q) {
    const inTitle = card.title.toLowerCase().includes(q);
    const inDescription = (card.description ?? "").toLowerCase().includes(q);
    if (!inTitle && !inDescription) return false;
  }
  if (filters.myTasksOnly && !card.assigneeIds.includes(currentUserId)) return false;
  if (filters.urgentOnly && card.priority !== "URGENT") return false;
  if (filters.memberId && !card.assigneeIds.includes(filters.memberId)) return false;
  return true;
}
