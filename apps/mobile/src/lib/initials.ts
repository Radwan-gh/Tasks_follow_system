import { personInitials } from "@app/types";

/** Who an avatar stands for — `firstName`/`lastName` when the row carries them. */
export interface AvatarPerson {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
}

/**
 * The design's avatar label: first-name letter and last-name letter,
 * dot-separated — «أحمد العتيبي» → «أ.ع». The rule itself is shared with the
 * web app (`personInitials` in `packages/types`).
 */
export function initials(person: { displayName: string; firstName?: string; lastName?: string }): string {
  return personInitials(person);
}
