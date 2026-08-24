/**
 * The design's avatar label: the first letter of each of the first two words,
 * dot-separated — «رضوان غانم» → «ر.غ». Falls back to the first character for
 * single-word names, and to «؟» for an empty one.
 */
export function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "؟";
  if (words.length === 1) return words[0]!.slice(0, 1);
  return `${words[0]!.slice(0, 1)}.${words[1]!.slice(0, 1)}`;
}
