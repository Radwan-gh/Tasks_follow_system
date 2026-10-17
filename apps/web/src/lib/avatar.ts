/** The five swatches in `tailwind.config.js` (`avatar.*`), spelled out so Tailwind sees each class. */
const AVATAR_CLASSES = [
  "bg-avatar-blueBg text-avatar-blueFg",
  "bg-avatar-violetBg text-avatar-violetFg",
  "bg-avatar-amberBg text-avatar-amberFg",
  "bg-avatar-greenBg text-avatar-greenFg",
  "bg-avatar-slateBg text-avatar-slateFg",
] as const;

/** Deterministic per-user avatar colour — same hash as mobile's `avatarColorFor`, so a person keeps one colour everywhere. */
export function avatarClassFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_CLASSES[hash % AVATAR_CLASSES.length]!;
}

/**
 * Mirrors `personInitials()` from `@app/types` — that package compiles to
 * CommonJS, which Rollup cannot name-import at runtime (see `can-supervise.ts`).
 * Keep the rule identical: first-name letter and last-name letter,
 * dot-separated («أ.ع»), skipping «ال» on a family name, falling back to the
 * first and last word of `displayName`.
 */
export function personInitials(person: { displayName: string; firstName?: string; lastName?: string }): string {
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

function firstLetter(name: string): string {
  const word = name.trim();
  const stem = word.length > 3 && word.startsWith("ال") ? word.slice(2) : word;
  return Array.from(stem)[0] ?? "";
}
