import type { RecurrenceRule } from "@app/types";
import { appTimeZone, deadlineOf, fromWallClock, toWallClock } from "./time-zone.util";

/**
 * Given a card's repeat rule and the due date of the cycle that was just
 * moved into «انتهى», compute one period later (`design-prompt-group-3.md` §3):
 * "موعدها = الموعد السابق + الدورة". `nextCycleDueDate` builds on it.
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

/**
 * The due date a recurring task reopens with when a cycle closes at `now`: one
 * period after that cycle's due date (after `now` when it had none), skipped
 * ahead past occurrences whose deadline has already gone — so a late close never
 * reopens the task overdue, and a daily task closed five days late is caught up
 * by one close, not five. The lateness itself is kept on the cycle.
 */
export function nextCycleDueDate(
  rule: RecurrenceRule,
  dueDate: Date | null,
  hasTime: boolean,
  now = new Date(),
  timeZone = appTimeZone(),
): Date {
  let next = nextRecurrenceDate(rule, dueDate ?? now, timeZone);
  // Bounded only against a nonsense clock; a daily rule years behind is a few thousand steps.
  for (let i = 0; i < 10_000 && deadlineOf(next, hasTime, timeZone) < now; i++) {
    next = nextRecurrenceDate(rule, next, timeZone);
  }
  return next;
}

/** Whole minutes a cycle closed past its deadline — 0 when on time, null without a due date. */
export function cycleLateMinutes(
  dueDate: Date | null,
  hasTime: boolean,
  closedAt: Date,
  timeZone = appTimeZone(),
): number | null {
  if (!dueDate) return null;
  return Math.max(0, Math.ceil((closedAt.getTime() - deadlineOf(dueDate, hasTime, timeZone).getTime()) / 60_000));
}
