import { z } from "zod";
import { CardPriority, ListStatusCategory } from "./domain";

/**
 * `GET /search` — one box that finds boards (name, description), tasks (title,
 * description) and subtasks (title) across every board the caller is on, or
 * inside one board when `boardId` is given. See `docs/19-search.md`.
 *
 * Two characters minimum: one Arabic letter matches nearly everything.
 */
export const SearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  boardId: z.string().min(1).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** A board whose name or description matches. */
export const SearchBoardHitSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Only when the match is in the description and not the name: a short
  // plain-text excerpt around it (`searchSnippet`). Otherwise null.
  descriptionSnippet: z.string().nullable(),
});
export type SearchBoardHit = z.infer<typeof SearchBoardHitSchema>;

/** A task whose title or description matches. */
export const SearchCardHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  // The board it is listed under for this caller — its home board when they
  // are on it, else the first of its other boards they are on (as «مهامي»).
  // Inside a board-scoped search, always that board.
  boardId: z.string(),
  boardName: z.string(),
  listName: z.string(),
  statusCategory: ListStatusCategory.nullable(),
  priority: CardPriority,
  dueDate: z.string().datetime().nullable(),
  // As on `SearchBoardHit`: set only when the title itself does not match.
  descriptionSnippet: z.string().nullable(),
});
export type SearchCardHit = z.infer<typeof SearchCardHitSchema>;

/** A subtask whose title matches — opening it opens its task. */
export const SearchSubtaskHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  isDone: z.boolean(),
  cardId: z.string(),
  cardTitle: z.string(),
  boardId: z.string(),
  boardName: z.string(),
});
export type SearchSubtaskHit = z.infer<typeof SearchSubtaskHitSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  boards: z.array(SearchBoardHitSchema),
  cards: z.array(SearchCardHitSchema),
  subtasks: z.array(SearchSubtaskHitSchema),
  // True when any of the three lists was cut at its limit — the screen says
  // to type more rather than pretending it showed everything.
  truncated: z.boolean(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** Arabic letter forms people type interchangeably, folded to one form each. */
export const SEARCH_LETTER_FOLDS: Readonly<Record<string, string>> = {
  "أ": "ا",
  "إ": "ا",
  "آ": "ا",
  "ٱ": "ا",
  "ة": "ه",
  "ى": "ي",
  "ؤ": "و",
  "ئ": "ي",
};

/**
 * Tashkeel (harakat, shadda, sukun, superscript alef) and tatweel — dropped
 * before matching. A string of the real characters (not `\u` escapes) so the
 * API can hand the same class to Postgres' `regexp_replace`.
 */
export const SEARCH_IGNORED_PATTERN = "[ً-ٰٟـ]";
const SEARCH_IGNORED_CHARS = new RegExp(SEARCH_IGNORED_PATTERN);

/**
 * The text as search compares it: lower case, tashkeel and tatweel dropped,
 * and the letter forms in `SEARCH_LETTER_FOLDS` folded — so «اسعار» finds
 * «أسعار» and «مدرسه» finds «مدرسة». `origin[i]` is the index in `text` of the
 * folded string's `i`-th character, with `origin[folded.length] === text.length`,
 * so a match in the folded text maps back onto the original for highlighting.
 *
 * The API's SQL applies the same folding (`SearchService`); keep them in step.
 */
export function foldForSearch(text: string): { folded: string; origin: number[] } {
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (SEARCH_IGNORED_CHARS.test(ch)) continue;
    const lower = ch.toLowerCase();
    // Keep one character per character so `origin` stays a plain index map.
    const single = lower.length === 1 ? lower : ch;
    folded += SEARCH_LETTER_FOLDS[single] ?? single;
    origin.push(i);
  }
  origin.push(text.length);
  return { folded, origin };
}

/** Where `query` first occurs in `text` under `foldForSearch`, as indexes into `text`; null if it does not. */
export function findSearchMatch(text: string, query: string): { start: number; end: number } | null {
  const needle = foldForSearch(query.trim()).folded;
  if (!needle) return null;
  const { folded, origin } = foldForSearch(text);
  const at = folded.indexOf(needle);
  if (at === -1) return null;
  return { start: origin[at]!, end: origin[at + needle.length]! };
}

/**
 * A description as one line of plain text: `[label](url)` becomes its label,
 * `**bold**` loses its stars, and line breaks become spaces — the task
 * screen's light markup (`apps/mobile/src/lib/rich-text.ts`) without the markup.
 */
export function plainSearchText(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * About `radius` characters either side of the first match of `query` in the
 * plain-text form of `text`, with «…» where it was cut. Null when the match
 * only sat inside markup (a link's URL), so there is nothing readable to show.
 */
export function searchSnippet(text: string, query: string, radius = 40): string | null {
  const plain = plainSearchText(text);
  const match = findSearchMatch(plain, query);
  if (!match) return null;
  let start = Math.max(0, match.start - radius);
  let end = Math.min(plain.length, match.end + radius);
  // Cut at a space so no word is shown half.
  if (start > 0) {
    const space = plain.indexOf(" ", start);
    if (space !== -1 && space < match.start) start = space + 1;
  }
  if (end < plain.length) {
    const space = plain.lastIndexOf(" ", end);
    if (space >= match.end) end = space;
  }
  return `${start > 0 ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`;
}
