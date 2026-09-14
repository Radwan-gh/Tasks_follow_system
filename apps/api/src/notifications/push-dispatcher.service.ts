import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { describeNotification, PUSH_TITLE, type NotificationType } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { FcmService, type PushMessage } from "./push/fcm.service";
import { PushDevicesService } from "./push/push-devices.service";

/** Rows older than this are stamped without sending — a push for something that happened an hour ago is noise, not news. */
const MAX_PUSH_AGE_MS = 60 * 60 * 1000;

/** Bounds the work per tick so a backlog drains over several runs instead of one huge query. */
const BATCH_SIZE = 100;

/**
 * Delivers pending `Notification` rows as OS push, using the table itself as an
 * outbox (`pushedAt IS NULL` = not yet swept).
 *
 * Sweeping rather than pushing inline from `NotificationsService.notify` is
 * deliberate: `notify` runs *inside* the caller's Prisma transaction, so an
 * inline send would fire for work that later rolls back, and would hold the
 * transaction open across a network call. Reading committed rows on a timer
 * avoids both, needs no changes in `CardsService`/`CommentsService`, and
 * survives an API restart mid-delivery.
 *
 * Prefs need no re-checking here: `notify` already gates on them before
 * inserting, so every row present is one the recipient agreed to receive.
 */
@Injectable()
export class PushDispatcherService {
  private readonly logger = new Logger(PushDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
    private readonly devices: PushDevicesService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async dispatchPending(): Promise<void> {
    if (!this.fcm.isEnabled) return;

    const pending = await this.prisma.notification.findMany({
      where: { pushedAt: null },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: { id: true, userId: true, type: true, cardId: true, boardId: true, payload: true, createdAt: true },
    });
    if (pending.length === 0) return;

    // Stamp the whole batch up front. `pushedAt` records that a row was
    // *attempted*, not that it arrived — otherwise one permanently-failing
    // token would keep the same rows at the head of the queue forever, and a
    // send that succeeds but crashes before the update would double-push.
    const sweptIds = pending.map((row) => row.id);
    await this.prisma.notification.updateMany({ where: { id: { in: sweptIds } }, data: { pushedAt: new Date() } });

    const cutoff = Date.now() - MAX_PUSH_AGE_MS;
    const fresh = pending.filter((row) => row.createdAt.getTime() >= cutoff);
    if (fresh.length === 0) return;

    const tokensByUser = new Map<string, string[]>();
    for (const device of await this.devices.listForUsers([...new Set(fresh.map((row) => row.userId))])) {
      const tokens = tokensByUser.get(device.userId) ?? [];
      tokens.push(device.token);
      tokensByUser.set(device.userId, tokens);
    }
    if (tokensByUser.size === 0) return;

    const messages: PushMessage[] = [];
    for (const row of fresh) {
      const tokens = tokensByUser.get(row.userId);
      if (!tokens) continue;
      const body = describeNotification({
        type: row.type as NotificationType,
        payload: row.payload as Record<string, unknown> | null,
      });
      for (const token of tokens) {
        messages.push({
          token,
          title: PUSH_TITLE,
          body,
          // FCM data values must be strings; the app reads `cardId` to deep-link on tap.
          data: {
            notificationId: row.id,
            cardId: row.cardId ?? "",
            boardId: row.boardId ?? "",
          },
        });
      }
    }

    const results = await this.fcm.send(messages);
    await this.devices.removeDeadTokens(results.filter((r) => r.unregistered).map((r) => r.token));

    const delivered = results.filter((r) => r.ok).length;
    this.logger.log(`Push sweep: ${fresh.length} notification(s) → ${delivered}/${results.length} message(s) delivered`);
  }
}
