import type { Prisma } from "@prisma/client";

/*
 * Deleting a task is a pending delete (docs/05-boards-lists-cards.md):
 * `DELETE /cards/:id` stamps `Card.deletedAt`, the task vanishes at once, and
 * `POST /cards/:id/restore` brings it back within `RESTORE_WINDOW_MS`. After
 * that `CardsService.purgeDeletedCards` deletes the row for good — with the
 * same cascade as the old permanent delete.
 *
 * Every card read filters on these instead of spelling the condition out, so
 * "a pending-deleted card is invisible" has one definition:
 * `assertCardAccess` (every card-scoped route), board detail and counts,
 * my-tasks, reports, oversight, the due-date sweep and the column helpers in
 * `card-placement.util.ts`.
 */

/** How long a deleted task can be brought back — what `restoreUntil` promises. */
export const RESTORE_WINDOW_MS = 30_000;

/**
 * Slack on top of the window for an «تراجع» tapped at the last moment whose
 * request lands a little late. The row is purged only after window + grace, so
 * a restore the server accepts always finds it.
 */
export const RESTORE_GRACE_MS = 5_000;

/** Not pending deletion — archived or not. */
export const NOT_DELETED = { deletedAt: null } as const satisfies Prisma.CardWhereInput;

/** A card that shows anywhere: neither archived nor pending deletion. */
export const LIVE_CARD = { isArchived: false, deletedAt: null } as const satisfies Prisma.CardWhereInput;

/** The `restoreUntil` a delete at `deletedAt` reports. */
export function restoreDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RESTORE_WINDOW_MS);
}

/** Whether a task deleted at `deletedAt` can still be restored at `now`. */
export function isRestorable(deletedAt: Date, now: Date): boolean {
  return now.getTime() <= deletedAt.getTime() + RESTORE_WINDOW_MS + RESTORE_GRACE_MS;
}

/** Tasks deleted before this are past restoring, and are purged. */
export function purgeCutoff(now: Date): Date {
  return new Date(now.getTime() - RESTORE_WINDOW_MS - RESTORE_GRACE_MS);
}
