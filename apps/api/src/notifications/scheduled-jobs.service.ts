import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";
import { appTimeZone, fromWallClock } from "../common/util/time-zone.util";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

/**
 * Due-date sweep — `design-prompt-group-3.md` §3: "اقتراب موعد (قبل يوم)" ·
 * "تأخّر مهمتي". Runs at the top of every hour from 08:00 to 22:00 in the
 * users' time zone (`appTimeZone`, not the server's UTC), so a reminder lands
 * within an hour of a card entering its last 24 hours — or of being given a
 * due date already that close — and never as a push in the middle of the night.
 * A card due overnight is warned about the evening before and flagged overdue
 * at 08:00. A date-only due date (`dueDateHasTime: false`) counts as due at the
 * end of that day, so its warning arrives that morning and it is overdue the
 * next — not overdue on its own due day because of the time it is stored at.
 *
 * Each reminder fires once per (recipient, type, card, due date): a one-time
 * heads-up, not an hourly nag. Moving the due date re-arms both reminders for
 * the new date, since the old warning no longer says anything true.
 */
const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron("0 0 8-22 * * *", { timeZone: appTimeZone() })
  async runDueDateSweep(): Promise<void> {
    await this.sweepDueDates(new Date());
  }

  /** The sweep itself, with the clock passed in so it can be tested. */
  async sweepDueDates(now: Date): Promise<void> {
    const in24h = new Date(now.getTime() + DAY);

    const candidates = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        // Wide enough for a date-only card whose day ends within 24h; narrowed below.
        dueDate: { not: null, lt: new Date(now.getTime() + 2 * DAY) },
        list: { statusCategory: { notIn: COMPLETED_CATEGORIES } },
      },
      select: {
        id: true,
        title: true,
        boardId: true,
        dueDate: true,
        dueDateHasTime: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
    });
    const openCards = candidates
      .map((card) => ({ ...card, deadline: deadlineOf(card.dueDate!, card.dueDateHasTime) }))
      .filter((card) => card.deadline < in24h);
    if (openCards.length === 0) return;

    // One read for everything already sent, rather than a lookup per card per
    // recipient every hour — overdue cards nobody closes stay in this scan for good.
    const sentRows = await this.prisma.notification.findMany({
      where: { type: { in: ["DUE_SOON", "OVERDUE"] }, cardId: { in: openCards.map((c) => c.id) } },
      select: { userId: true, type: true, cardId: true, payload: true },
    });
    const sent = new Set(sentRows.map((r) => sentKey(r.userId, r.type, r.cardId!, payloadDueDate(r.payload))));

    for (const card of openCards) {
      const type = card.deadline < now ? "OVERDUE" : "DUE_SOON";
      const dueDate = card.dueDate!.toISOString();
      const recipients = card.assignees.length > 0 ? card.assignees.map((a) => a.userId) : [card.createdById];
      for (const userId of recipients) {
        // A row from before due dates were recorded in the payload counts for
        // whatever the date is now — otherwise every old reminder would repeat once.
        if (sent.has(sentKey(userId, type, card.id, dueDate)) || sent.has(sentKey(userId, type, card.id, null))) continue;
        await this.notifications.notify(this.prisma, {
          userId,
          actorId: "", // System-generated — never the recipient, so `notify`'s self-notify guard is a no-op here.
          type,
          cardId: card.id,
          boardId: card.boardId,
          // Without `cardTitle` this renders as «موعد «مهمة» يقترب» — tolerable in
          // the bell, but the push banner is the only thing the user sees.
          // `dueDate` is the dedupe key above.
          payload: { cardTitle: card.title, dueDate },
        });
      }
    }

    this.logger.log(`Due-date sweep: scanned ${openCards.length} open card(s) with a due date`);
  }
}

/**
 * When a card actually becomes late. A date-only due date is stored at an
 * arbitrary hour of its day (midnight UTC from the web, noon local from mobile —
 * both on the intended UTC date), so it runs to the end of that day in the
 * users' time zone.
 */
export function deadlineOf(dueDate: Date, hasTime: boolean): Date {
  if (hasTime) return dueDate;
  return fromWallClock(new Date(`${dueDate.toISOString().slice(0, 10)}T23:59:59.999Z`));
}

function payloadDueDate(payload: unknown): string | null {
  const value = (payload as Record<string, unknown> | null)?.dueDate;
  return typeof value === "string" ? value : null;
}

function sentKey(userId: string, type: string, cardId: string, dueDate: string | null): string {
  return `${userId}|${type}|${cardId}|${dueDate ?? ""}`;
}
