import { useMemo, useState } from "react";
import type { BoardMember } from "@app/types";

/**
 * The one place the web app renders "pick people" UI — card assignees,
 * subtask assignees and the restricted-access list all go through
 * `MemberChecklist`, so searching, the selected chips and the empty states
 * behave identically everywhere a user is chosen.
 *
 * Board *membership* itself is added from `BoardMembersModal`, which searches
 * the user directory (`GET /boards/:id/member-candidates`) instead of this
 * in-memory list, but reuses `UserAvatar`/`matchesUser` from here.
 */

/** Longer lists get a search box; below this a plain list is faster to scan than to filter. */
const SEARCH_THRESHOLD = 6;

/** First letter of each of the first two words — same rule as the mobile app's `initials()`. */
export function initialsOf(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Case-insensitive match on display name *or* email — the same rule the server uses for its search. */
export function matchesUser(user: { displayName: string; email: string }, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return user.displayName.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle);
}

export function UserAvatar({ displayName, dimmed = false }: { displayName: string; dimmed?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      {initialsOf(displayName)}
    </span>
  );
}

/** Name + email + an optional "معطَّل" badge — the shared row for any user list. */
export function UserIdentity({
  displayName,
  email,
  isActive = true,
}: {
  displayName: string;
  email: string;
  isActive?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <UserAvatar displayName={displayName} dimmed={!isActive} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-slate-700">{displayName}</span>
        <span className="block truncate text-xs text-slate-400">{email}</span>
      </span>
      {!isActive && (
        <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">معطَّل</span>
      )}
    </span>
  );
}

/**
 * A searchable checkbox list of board members. Selected people are always
 * visible as chips above the list, so a search term can never hide who is
 * already picked.
 */
export function MemberChecklist({
  members,
  selected,
  onToggle,
  onClear,
  emptyHint,
}: {
  members: BoardMember[];
  selected: Set<string>;
  onToggle: (userId: string) => void;
  onClear?: () => void;
  emptyHint: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => (search.trim() ? members.filter((m) => matchesUser(m.user, search)) : members),
    [members, search],
  );
  const chosen = useMemo(() => members.filter((m) => selected.has(m.userId)), [members, selected]);

  if (members.length === 0) return <p className="text-xs text-slate-400">{emptyHint}</p>;

  return (
    <div className="space-y-2 rounded border border-slate-200 p-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chosen.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => onToggle(m.userId)}
              title={`إزالة ${m.user.displayName}`}
              className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pe-1.5 ps-2 text-xs text-slate-700 hover:bg-slate-200"
            >
              <span className="max-w-[10rem] truncate">{m.user.displayName}</span>
              <span aria-hidden className="text-slate-400">
                ✕
              </span>
            </button>
          ))}
          {onClear && chosen.length > 1 && (
            <button type="button" onClick={onClear} className="text-xs text-slate-500 hover:underline">
              مسح الكل
            </button>
          )}
        </div>
      )}

      {members.length >= SEARCH_THRESHOLD && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو البريد الإلكتروني"
          aria-label="ابحث عن عضو"
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
        />
      )}

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-xs text-slate-400">لا يوجد عضو يطابق «{search.trim()}».</p>
        ) : (
          filtered.map((m) => (
            <label
              key={m.userId}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.has(m.userId)}
                onChange={() => onToggle(m.userId)}
                className="shrink-0"
              />
              <UserIdentity
                displayName={m.user.displayName}
                email={m.user.email}
                isActive={m.user.isActive}
              />
            </label>
          ))
        )}
      </div>
    </div>
  );
}
