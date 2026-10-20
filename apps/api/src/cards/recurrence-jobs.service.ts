import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { appTimeZone, deadlineOf } from "../common/util/time-zone.util";
import { CARD_INSTANCES_INCLUDE } from "../boards/boards.service";
import { PrismaService } from "../prisma/prisma.service";
import { BOARD_LINKS_INCLUDE } from "./card-placement.util";
import { CardsService } from "./cards.service";

/** What `CardsService.spawnNextRecurrence` reads off the previous instance. */
const SPAWN_SOURCE_INCLUDE = {
  members: { select: { userId: true } },
  assignees: { select: { userId: true } },
  boardLinks: BOARD_LINKS_INCLUDE,
  ...CARD_INSTANCES_INCLUDE,
} as const satisfies Prisma.CardInclude;

/**
 * The due-date trigger of «توليد المهمة المتكررة» (docs/14): a repeating task
 * whose due date passed without anyone finishing it still gets its next
 * instance, so the next cycle shows up in «جديد» on time. The other two
 * triggers — a move into «تم التنفيذ» or «انتهى» — run inside the move itself
 * (`CardsService.update`); whichever comes first spawns, and the instance link
 * (`previousInstanceId`, unique) keeps the others from spawning again.
 *
 * A date-only due date passes at the end of its day in the users' time zone
 * (`deadlineOf`, the moment the card turns overdue), a timed one at its time.
 * Every 15 minutes, so a cycle appears within a quarter hour of the previous
 * one's deadline.
 *
 * Cards in «انتهى» are skipped: closing has always spawned, so a closed card
 * without a linked next instance is one from before the links existed (or
 * whose board had no «جديد» list), not one still waiting for its due date.
 */
@Injectable()
export class RecurrenceJobsService {
  private readonly logger = new Logger(RecurrenceJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardsService,
  ) {}

  @Cron("0 */15 * * * *", { timeZone: appTimeZone() })
  async runDueRecurrenceSweep(): Promise<void> {
    await this.spawnDueRecurrences(new Date());
  }

  async spawnDueRecurrences(now: Date): Promise<number> {
    const candidates = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        NOT: { recurrence: { equals: Prisma.AnyNull } },
        // Its deadline is at most the end of the due day, so nothing due after now can have passed.
        dueDate: { not: null, lte: now },
        nextInstance: { is: null },
        list: { statusCategory: { not: "CLOSED" } },
      },
      select: { id: true, dueDate: true, dueDateHasTime: true },
    });
    const due = candidates.filter((card) => deadlineOf(card.dueDate!, card.dueDateHasTime) <= now);

    let spawned = 0;
    for (const { id } of due) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const card = await tx.card.findUnique({ where: { id }, include: SPAWN_SOURCE_INCLUDE });
          if (!card || card.isArchived) return null;
          // System-generated: no actor to spare from the assignment notifications.
          return this.cards.spawnNextRecurrence(tx, card, "", now);
        });
        if (created) spawned++;
      } catch (error) {
        // P2002 on `previousInstanceId`: a move spawned it first, which is fine.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        this.logger.error(`Recurrence sweep: could not spawn the next instance of card ${id}`, error as Error);
      }
    }

    if (due.length > 0) {
      this.logger.log(`Recurrence sweep: ${due.length} repeating card(s) past their due date, spawned ${spawned}`);
    }
    return spawned;
  }
}
