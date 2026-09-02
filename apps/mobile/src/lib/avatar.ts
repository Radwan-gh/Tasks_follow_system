import { avatarPalette } from "@/theme/tokens";

/** Deterministic per-user avatar colour, cycling through the design's five swatches. */
export function avatarColorFor(userId: string): (typeof avatarPalette)[number] {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return avatarPalette[hash % avatarPalette.length]!;
}
