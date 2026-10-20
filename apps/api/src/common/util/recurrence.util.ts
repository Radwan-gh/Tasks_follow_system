import type { RecurrenceRule } from "@app/types";
import { appTimeZone, deadlineOf, fromWallClock, toWallClock } from "./time-zone.util";

/**
 * Given a card's repeat rule and the due date of the instance that was just
 * moved into «انتهى», compute the due date of the next instance
 * (`design-prompt-group-3.md` §3): "موعدها = الموعد السابق + الدورة".
 * Days are counted on the users' calendar (`appTimeZone`), not the server's
 * UTC one, and the wall-clock time of day is kept, so a timed due date keeps
 * its local hour.
 */
export function nextRecurrenceDate(rule: RecurrenceRule, from: Date, timeZone = appTimeZone()): Date {
  const next = toWallClock(from, timeZone);
  switch (rule.freq) {
    case "DAILY": {
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    }
    case "WEEKLY": {
      const weekdays = new Set(rule.weekdays);
      // `weekdays` is non-empty (schema enforces `.min(1)`), so a match always comes within 7 days.
      for (let i = 0; i < 7; i++) {
        next.setUTCDate(next.getUTCDate() + 1);
        if (weekdays.has(next.getUTCDay())) break;
      }
      break;
    }
    case "MONTHLY": {
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const lastDayOfMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(rule.dayOfMonth, lastDayOfMonth));
      break;
    }
  }
  return fromWallClock(next, timeZone);
}

/** Far more cycles than any real backlog (≈ 3 years of a daily task); only a guard against a runaway loop. */
const MAX_SKIPPED_CYCLES = 1000;

/**
 * The due date of the next instance when it is spawned at `now`: the cycle after
 * `from` (the previous instance's due date, or `now` without one), moved on cycle
 * by cycle until it is still ahead — its deadline (`deadlineOf`, the end of the
 * day for a date-only due date) is after `now`. Cycles missed while the previous
 * instance sat overdue are skipped rather than spawned as a backlog; the overdue
 * instance itself is the record of what was missed.
 */
export function nextUpcomingRecurrenceDate(
  rule: RecurrenceRule,
  from: Date,
  hasTime: boolean,
  now: Date,
  timeZone = appTimeZone(),
): Date {
  let next = nextRecurrenceDate(rule, from, timeZone);
  for (let i = 0; i < MAX_SKIPPED_CYCLES && deadlineOf(next, hasTime, timeZone) <= now; i++) {
    next = nextRecurrenceDate(rule, next, timeZone);
  }
  return next;
}
