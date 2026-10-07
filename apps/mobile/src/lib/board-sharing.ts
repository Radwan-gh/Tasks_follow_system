import type { BoardSummary, NotificationType } from "@app/types";

/**
 * What the owner of a personal board is told about its share request
 * (`docs/18-board-sharing.md`): still waiting, or turned down and why. Nothing
 * for a shared board, a board that never asked, or anyone but the owner.
 */
export type ShareNotice = { kind: "pending" } | { kind: "rejected"; reason: string | null } | null;

export function shareNoticeFor(
  board: Pick<BoardSummary, "kind" | "shareRequest" | "ownerId">,
  userId: string | undefined,
): ShareNotice {
  if (!userId || board.ownerId !== userId || board.kind !== "PERSONAL" || !board.shareRequest) return null;
  if (board.shareRequest.status === "PENDING") return { kind: "pending" };
  if (board.shareRequest.status === "REJECTED") return { kind: "rejected", reason: board.shareRequest.reason };
  return null;
}

/**
 * Where tapping a notification goes — the in-app centre and an OS push tap
 * share this. Board-sharing rows carry a board but no card: a request goes to
 * the approver queue (the approver usually can't open the still-personal
 * board), a decision to the board itself.
 */
export type NotificationTarget =
  | { kind: "card"; cardId: string; boardId: string | undefined }
  | { kind: "board"; boardId: string }
  | { kind: "board-requests" }
  | null;

export function notificationTarget(input: {
  type?: NotificationType | string | null;
  cardId?: string | null;
  boardId?: string | null;
}): NotificationTarget {
  if (input.type === "BOARD_SHARE_REQUESTED") return { kind: "board-requests" };
  if (input.cardId) return { kind: "card", cardId: input.cardId, boardId: input.boardId || undefined };
  if ((input.type === "BOARD_SHARE_APPROVED" || input.type === "BOARD_SHARE_REJECTED") && input.boardId) {
    return { kind: "board", boardId: input.boardId };
  }
  return null;
}
