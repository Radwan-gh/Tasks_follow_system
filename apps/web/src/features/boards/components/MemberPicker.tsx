import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { BoardMember } from "@app/types";

/**
 * The one place the web app renders "pick people" UI — card assignees,
 * subtask assignees, the restricted-access list and board membership all go
 * through `UserTypeahead`, so matching, the selected chips and the empty
 * states behave identically everywhere a user is chosen.
 *
 * Board membership (`BoardMembersModal`) differs only in where suggestions
 * come from: the user directory (`GET /boards/:id/member-candidates`, fed in
 * through `onTermChange`) instead of the board's in-memory member list.
 */

/** How many suggestions the type-ahead shows — enough to disambiguate, few enough to read at a glance. */
const SUGGESTION_LIMIT = 3;

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

/** Case-insensitive match on display name *or* username — the same rule the server uses for its search. */
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
 * An empty term suggests nobody: the list only opens once the user types.
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

/** `text` with the first case-insensitive occurrence of `term` emphasised — shows *why* a row matched. */
function MatchedText({ text, term }: { text: string; term: string }) {
  const needle = term.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="rounded-sm bg-accent-soft font-bold text-accent">{text.slice(at, at + needle.length)}</span>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * Type a few letters, get the top {@link SUGGESTION_LIMIT} matching members;
 * Enter (or a click) adds the highlighted one as a chip under the box, and the
 * box clears for the next name. Every add/remove calls `onChange` with the
 * whole new set — callers save it straight away (`useAutoSavedIds`).
 *
 * A member who was picked before being deactivated stays as a chip and can be
 * removed, matching the server's "only new assignments are blocked" rule.
 */
export function UserTypeahead({
  members,
  selectedIds,
  onChange,
  lookup = members,
  label,
  placeholder = "اكتب اسمًا أو اسم مستخدم",
  emptyHint,
  noMatchText = (term) => `لا يوجد عضو يطابق «${term}».`,
  searching = false,
  onTermChange,
  lockedIds,
  chipExtra,
  saving = false,
  failed = false,
}: {
  /** Who can be suggested. */
  members: BoardMember[];
  selectedIds: string[];
  onChange: (userIds: string[]) => void;
  /** Where chips resolve their person from, when wider than `members` (e.g. people already on the board). */
  lookup?: BoardMember[];
  /** The line shown when nobody matches the typed text. */
  noMatchText?: (term: string) => string;
  /** Suggestions are still loading from the server — say so instead of "no match". */
  searching?: boolean;
  /** Called with the typed text, for callers that search the server rather than `members` alone. */
  onTermChange?: (term: string) => void;
  /** Chips without a remove button (e.g. the board owner). */
  lockedIds?: ReadonlySet<string>;
  /** Extra control rendered inside a chip, after the name (e.g. a role toggle). */
  chipExtra?: (member: BoardMember) => ReactNode;
  /** Accessible name of the input, e.g. «أضف مسؤولًا». */
  label: string;
  placeholder?: string;
  /** Shown instead of the box when there is nobody to pick at all. */
  emptyHint: string;
  saving?: boolean;
  failed?: boolean;
}) {
  const listId = useId();
  const [term, setTerm] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const matches = useMemo(() => topMatches(members, term, selected), [members, term, selected]);
  const chosen = useMemo(
    () =>
      selectedIds
        .map((id) => lookup.find((m) => m.userId === id))
        .filter((m): m is BoardMember => !!m),
    [lookup, selectedIds],
  );

  const open = focused && term.trim().length > 0;
  const active = Math.min(highlight, Math.max(matches.length - 1, 0));

  if (members.length === 0 && chosen.length === 0 && !onTermChange) {
    return <p className="text-xs text-muted">{emptyHint}</p>;
  }

  function changeTerm(next: string) {
    setTerm(next);
    setHighlight(0);
    onTermChange?.(next);
  }

  function add(member: BoardMember | undefined) {
    if (!member) return;
    onChange([...selectedIds, member.userId]);
    changeTerm("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && matches.length > 0) {
      e.preventDefault();
      setHighlight(Math.min(active + 1, matches.length - 1));
    } else if (e.key === "ArrowUp" && matches.length > 0) {
      e.preventDefault();
      setHighlight(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) add(matches[active]);
    } else if (e.key === "Escape" && term) {
      // Clear the text only — don't let this Escape also close the card panel.
      e.stopPropagation();
      changeTerm("");
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches.length > 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={term}
          onChange={(e) => changeTerm(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-field border border-line bg-surface p-1 shadow-lg"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted">
                {searching ? "جارٍ البحث…" : noMatchText(term.trim())}
              </li>
            ) : (
              matches.map((m, index) => (
                <li
                  key={m.userId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  // Keep focus in the input so the next name can be typed straight away.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => add(m)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[12px] px-2 py-1.5 ${
                    index === active ? "bg-canvas" : ""
                  }`}
                >
                  <ChipAvatar displayName={m.user.displayName} large />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      <MatchedText text={m.user.displayName} term={term} />
                    </span>
                    <span className="block truncate text-right text-xs text-muted" dir="ltr">
                      <MatchedText text={m.user.username} term={term} />
                    </span>
                  </span>
                  {index === active && (
                    <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] text-muted">
                      Enter
                    </kbd>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {(chosen.length > 0 || saving || failed) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chosen.map((m) => (
            <span
              key={m.userId}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pe-0.5 ps-1 text-xs text-ink ${
                m.user.isActive ? "" : "opacity-60"
              }`}
            >
              <ChipAvatar displayName={m.user.displayName} />
              <span className="max-w-[10rem] truncate">{m.user.displayName}</span>
              {!m.user.isActive && <span className="text-[10px] font-medium text-alert">معطَّل</span>}
              {chipExtra?.(m)}
              {lockedIds?.has(m.userId) ? (
                <span aria-hidden className="w-1" />
              ) : (
                <button
                  type="button"
                  onClick={() => onChange(selectedIds.filter((id) => id !== m.userId))}
                  aria-label={`إزالة ${m.user.displayName}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span aria-hidden>✕</span>
                </button>
              )}
            </span>
          ))}
          {saving && <span className="text-[11px] text-muted">جارٍ الحفظ…</span>}
          {failed && !saving && (
            <span role="alert" className="text-[11px] text-alert">
              تعذّر الحفظ، فأُعيدت القائمة إلى آخر حالة محفوظة.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ChipAvatar({ displayName, large = false }: { displayName: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface font-semibold text-accent ${
        large ? "h-7 w-7 border border-line text-[10px]" : "h-5 w-5 text-[9px]"
      }`}
    >
      {initialsOf(displayName)}
    </span>
  );
}
