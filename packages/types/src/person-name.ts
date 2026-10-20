import { z } from "zod";

/** One half of a person's name — what the admin/profile forms ask for. */
export const PersonNamePartSchema = z.string().trim().min(1).max(50);

/**
 * `User.displayName` is never typed in: the server stores `"<first> <last>"`
 * every time either half changes, so the ~everywhere that shows a person keeps
 * reading one field.
 */
export function composeDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/**
 * The Arabic definite article on a family name («العتيبي») would make every
 * such avatar read «ا» — skip it, as people do when writing initials.
 */
function firstLetter(name: string): string {
  const word = name.trim();
  const stem = word.length > 3 && word.startsWith("ال") ? word.slice(2) : word;
  return Array.from(stem)[0] ?? "";
}

/**
 * The avatar label: first-name letter and last-name letter, dot-separated —
 * «أحمد العتيبي» → «أ.ع». The dot also keeps two Arabic letters from joining
 * into what reads as a word. Uses the `firstName`/`lastName` fields when the
 * row carries them (a compound first name like «عبد الله» stays one name);
 * otherwise falls back to the first and *last* word of `displayName`. A
 * one-word name gives one letter, an empty one «؟». Mirrored by hand in
 * `apps/web/src/lib/avatar.ts` (Rollup can't runtime-import this CJS package).
 */
export function personInitials(person: {
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  let first = person.firstName?.trim() ?? "";
  let last = person.lastName?.trim() ?? "";
  if (!first) {
    const words = person.displayName.trim().split(/\s+/).filter(Boolean);
    first = words[0] ?? "";
    last = words.length > 1 ? words[words.length - 1]! : "";
  }
  const letters = [firstLetter(first), firstLetter(last)].filter(Boolean).map((l) => l.toUpperCase());
  return letters.length ? letters.join(".") : "؟";
}
