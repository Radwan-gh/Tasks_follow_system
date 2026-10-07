import { z } from "zod";
import { BoardShareRequestStatus, UserSchema } from "./domain";

/**
 * Board sharing (`docs/18-board-sharing.md`): a board is PERSONAL (its owner
 * alone, invisible to oversight) or SHARED (has members). Turning a board
 * SHARED takes an approver's sign-off, and the approver decides by comparing it
 * against existing boards with a *similar name* — the helpers below are that
 * comparison. Scope overlap is never judged automatically; the approver reads
 * the descriptions.
 */

/** Harakat and Quranic annotation marks, plus the superscript alef. */
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/**
 * Canonical form of a board name for duplicate detection: diacritics and
 * tatweel removed, hamza-carrying alefs (أ إ آ ٱ) → ا, ة → ه, ى → ي, Latin
 * lower-cased, whitespace collapsed. Two names that differ only in how they
 * were typed normalise to the same string.
 */
export function normalizeBoardName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(ARABIC_MARKS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The comparison key: the normalised words with a leading definite article
 * dropped, so «الهدي النبوي» and «هدي نبوي» compare equal.
 */
function nameWords(name: string): string[] {
  return normalizeBoardName(name)
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.startsWith("ال") && word.length > 3 ? word.slice(2) : word));
}

/**
 * Whether two board names look like the same thing: equal after
 * normalisation, or one name's words appear as a run inside the other's
 * («لوحة الهدي النبوي» ⊇ «الهدي النبوي»). Whole words only, so «عام» never
 * matches «طعام».
 */
export function isSimilarBoardName(a: string, b: string): boolean {
  const wa = nameWords(a);
  const wb = nameWords(b);
  if (wa.length === 0 || wb.length === 0) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return ` ${long.join(" ")} `.includes(` ${short.join(" ")} `);
}

const PersonSchema = UserSchema.pick({ id: true, username: true, displayName: true });

/**
 * A board that resembles a proposed name — the rows of
 * `GET /board-share-requests/similar` and of each request's `similarBoards`.
 * `pending` marks a personal board whose own share request is still waiting,
 * so two people asking for the same board at once see each other.
 */
export const SimilarBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  owner: PersonSchema,
  memberCount: z.number().int(),
  pending: z.boolean(),
});
export type SimilarBoard = z.infer<typeof SimilarBoardSchema>;

/** A share request as an approver sees it in «طلبات اللوحات المشتركة». */
export const BoardShareRequestSchema = z.object({
  id: z.string(),
  status: BoardShareRequestStatus,
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  board: z.object({ id: z.string(), name: z.string(), description: z.string().nullable() }),
  requestedBy: PersonSchema,
  decidedBy: PersonSchema.nullable(),
  similarBoards: z.array(SimilarBoardSchema),
});
export type BoardShareRequest = z.infer<typeof BoardShareRequestSchema>;
