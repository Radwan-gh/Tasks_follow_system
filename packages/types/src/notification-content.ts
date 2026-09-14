import type { NotificationType } from "./domain";

/**
 * The one place a notification's Arabic wording is defined. Shared because the
 * same sentence has to appear in two processes: the in-app bell/center renders
 * it client-side, and the push dispatcher bakes it into the FCM body
 * server-side. Two copies would drift, and a push that reads differently from
 * the row it links to is a bug users notice immediately.
 */
export function describeNotification(input: {
  type: NotificationType;
  payload?: Record<string, unknown> | null;
}): string {
  const title = typeof input.payload?.cardTitle === "string" ? input.payload.cardTitle : "مهمة";
  switch (input.type) {
    case "ASSIGNED":
      return `أُسندت إليك: ${title}`;
    case "DUE_SOON":
      return `موعد «${title}» يقترب`;
    case "OVERDUE":
      return `تأخّرت مهمة «${title}»`;
    case "COMMENT":
      return `تعليق جديد على «${title}»`;
    case "CARD_CLOSED":
      return `نُقلت «${title}» إلى «انتهى»`;
    default:
      return title;
  }
}

/** Push notification title — the app name, since the body carries the detail. */
export const PUSH_TITLE = "متابعة المهام";
