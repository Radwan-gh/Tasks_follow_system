import { Injectable, NotFoundException } from "@nestjs/common";
import type { Notification, NotificationPrefs, NotificationsResponse, NotificationType } from "@app/types";
import { NotificationPrefsSchema } from "@app/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type Tx = Prisma.TransactionClient | PrismaService;

const DEFAULT_PREFS: NotificationPrefs = {
  assignmentsAndComments: true,
  dueDatesAndOverdue: true,
  myCardsMoved: true,
};

/** Which `notificationPrefs` toggle gates each notification type (`account.tsx`'s three switches). */
const PREF_GATE: Record<NotificationType, keyof NotificationPrefs> = {
  ASSIGNED: "assignmentsAndComments",
  COMMENT: "assignmentsAndComments",
  DUE_SOON: "dueDatesAndOverdue",
  OVERDUE: "dueDatesAndOverdue",
  CARD_CLOSED: "myCardsMoved",
};

const MAX_NOTIFICATIONS = 100;

function parsePrefs(raw: unknown): NotificationPrefs {
  const result = NotificationPrefsSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_PREFS;
}

function serialize(row: {
  id: string;
  type: string;
  cardId: string | null;
  boardId: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): Notification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    cardId: row.cardId,
    boardId: row.boardId,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<NotificationsResponse> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: MAX_NOTIFICATIONS,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: rows.map(serialize), unreadCount };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException("Notification not found");
    if (row.readAt) return;
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    if (!user) throw new NotFoundException("User not found");
    return parsePrefs(user.notificationPrefs);
  }

  async updatePrefs(userId: string, patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const current = await this.getPrefs(userId);
    const next = { ...current, ...patch };
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: next } });
    return next;
  }

  /**
   * Create one notification, gated by the recipient's own prefs. Takes a
   * transaction client so callers (assignment, comments, card moves) can
   * insert it atomically with the mutation that triggered it — same pattern
   * as `CardsService.recordActivity`. Never notifies a user about their own
   * action (callers already exclude the actor, but this is a second guard).
   */
  async notify(
    tx: Tx,
    input: {
      userId: string;
      actorId: string;
      type: NotificationType;
      cardId?: string | null;
      boardId?: string | null;
      payload?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (input.userId === input.actorId) return;

    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { notificationPrefs: true } });
    if (!user) return;
    const prefs = parsePrefs(user.notificationPrefs);
    if (!prefs[PREF_GATE[input.type]]) return;

    await tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        cardId: input.cardId ?? null,
        boardId: input.boardId ?? null,
        payload: (input.payload as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  /**
   * Same as `notify`, but only if no notification of this exact
   * (userId, type, cardId) has ever been sent — the due-soon/overdue reminder
   * fires once per card, not once per scheduler tick (`scheduled-jobs.service.ts`).
   */
  async notifyOnce(
    tx: Tx,
    input: { userId: string; actorId: string; type: NotificationType; cardId: string; boardId?: string | null },
  ): Promise<void> {
    const existing = await tx.notification.findFirst({
      where: { userId: input.userId, type: input.type, cardId: input.cardId },
      select: { id: true },
    });
    if (existing) return;
    await this.notify(tx, input);
  }
}
