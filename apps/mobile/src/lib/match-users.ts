import type { BoardMember } from "@app/types";

/** How many suggestions the people type-ahead shows — enough to disambiguate, few enough to read at a glance. */
export const SUGGESTION_LIMIT = 3;

/** Case-insensitive match on display name *or* username — the same rule the server uses for its searches. */
export function matchesUser(user: { displayName: string; username: string }, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return user.displayName.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle);
}

/** A name or username that *starts* with the term (or has a word that does) beats a mid-word hit. */
function isPrefixMatch(user: { displayName: string; username: string }, needle: string): boolean {
  const name = user.displayName.toLowerCase();
  return (
    name.startsWith(needle) ||
    user.username.toLowerCase().startsWith(needle) ||
    name.split(/\s+/).some((word) => word.startsWith(needle))
  );
}

/**
 * The type-ahead's suggestions: members not already picked, still active
 * (the server rejects *newly* assigning a deactivated account), matching the
 * typed text — prefix hits first, then alphabetical — capped at `limit`.
 * An empty term suggests nobody: suggestions only appear once the user types.
 * Same rule as the web app's `topMatches` in `MemberPicker.tsx`.
 */
export function topMatches(
  members: BoardMember[],
  term: string,
  selectedIds: ReadonlySet<string>,
  limit = SUGGESTION_LIMIT,
): BoardMember[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  return members
    .filter((m) => !selectedIds.has(m.userId) && m.user.isActive && matchesUser(m.user, needle))
    .map((m) => ({ m, prefix: isPrefixMatch(m.user, needle) }))
    .sort((a, b) => Number(b.prefix) - Number(a.prefix) || a.m.user.displayName.localeCompare(b.m.user.displayName, "ar"))
    .slice(0, limit)
    .map(({ m }) => m);
}
