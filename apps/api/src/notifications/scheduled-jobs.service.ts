import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

/**
 * Daily due-date sweep — the only scheduled job in this project so far
 * (`design-prompt-group-3.md` §3: "اقتراب موعد (قبل يوم)" · "تأخّر مهمتي").
 * Each notification fires at most once per card ever (`notifyOnce`), so this
 * is a one-time heads-up as a card approaches/crosses its due date, not a
 * daily repeat — quieter than re-alerting on every run.
 */
@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDueDateSweep(): Promise<void> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const openCards = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        dueDate: { not: null, lt: in24h },
        list: { statusCategory: { notIn: COMPLETED_CATEGORIES } },
      },
      select: {
        id: true,
        boardId: true,
        dueDate: true,
        createdById: true,
        assignees: { select: { userId: true } },
      },
    });

    for (const card of openCards) {
      const type = card.dueDate! < now ? "OVERDUE" : "DUE_SOON";
      const recipients = card.assignees.length > 0 ? card.assignees.map((a) => a.userId) : [card.createdById];
      for (const userId of recipients) {
        await this.notifications.notifyOnce(this.prisma, {
          userId,
          actorId: "", // System-generated — never the recipient, so `notify`'s self-notify guard is a no-op here.
          type,
          cardId: card.id,
          boardId: card.boardId,
        });
      }
    }

    this.logger.log(`Due-date sweep: scanned ${openCards.length} open card(s) with a due date`);
  }
}
