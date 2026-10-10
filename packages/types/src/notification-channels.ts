import type { CardPriority, NotificationType } from "./domain";

/**
 * Android notification channels, one per kind of push. On Android 8+ the sound,
 * vibration and importance belong to the *channel*, not to the message, so
 * splitting pushes across channels is what lets a user give each kind its own
 * sound from the system settings (Settings → Apps → the app → Notifications).
 *
 * Shared because both ends must agree: the mobile app creates every channel in
 * this list, and the API names one of them as `channelId` on each FCM message.
 * Android caches a channel's settings on first creation, so an id here must
 * never be reused for a different meaning — add a new id instead.
 */
export const PUSH_CHANNELS = [
  { id: "urgent", name: "مهام عاجلة", description: "كل إشعار يخصّ مهمة أولويتها «عاجلة»" },
  { id: "due", name: "المواعيد والتأخير", description: "اقتراب موعد مهمة أو تأخّرها" },
  { id: "assignments", name: "الإسناد", description: "إسناد مهمة أو مهمة فرعية إليك" },
  { id: "comments", name: "التعليقات", description: "تعليق جديد على مهمة تتابعها" },
  { id: "completed", name: "الإنجاز", description: "إنهاء مهمة أو مهمة فرعية" },
  { id: "general", name: "عام", description: "الإشعارات اليدوية من الإدارة" },
] as const;

export type PushChannelId = (typeof PUSH_CHANNELS)[number]["id"];

/**
 * The channel a notification is delivered on. Priority wins over type: anything
 * about an urgent task rings the urgent sound, whatever happened to it — that
 * is the one sound a user must never mistake for routine traffic.
 */
export function pushChannelFor(type: NotificationType, priority?: CardPriority | null): PushChannelId {
  if (priority === "URGENT") return "urgent";
  switch (type) {
    case "DUE_SOON":
    case "OVERDUE":
      return "due";
    case "ASSIGNED":
    case "SUBTASK_ASSIGNED":
      return "assignments";
    case "COMMENT":
      return "comments";
    case "CARD_CLOSED":
    case "SUBTASK_COMPLETED":
      return "completed";
    default:
      return "general";
  }
}
