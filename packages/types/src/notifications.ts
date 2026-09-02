import { z } from "zod";
import { NotificationSchema } from "./domain";

/**
 * `GET /notifications` — newest first, capped server-side (see
 * `NotificationsService.list`). Grouping into اليوم/أمس/أقدم is a display
 * concern left to the client, same as `MyTasksResponseSchema`.
 */
export const NotificationsResponseSchema = z.object({
  items: z.array(NotificationSchema),
  unreadCount: z.number().int(),
});
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;
