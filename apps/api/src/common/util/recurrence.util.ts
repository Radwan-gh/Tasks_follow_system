import type { RecurrenceRule } from "@app/types";

/**
 * Given a card's repeat rule and the due date of the instance that was just
 * moved into «انتهى», compute the due date of the next instance
 * (`design-prompt-group-3.md` §3): "موعدها = الموعد السابق + الدورة".
 */
export function nextRecurrenceDate(rule: RecurrenceRule, from: Date): Date {
  switch (rule.freq) {
    case "DAILY": {
      const next = new Date(from);
      next.setDate(next.getDate() + 1);
      return next;
    }
    case "WEEKLY": {
      const weekdays = new Set(rule.weekdays);
      const next = new Date(from);
      for (let i = 0; i < 7; i++) {
        next.setDate(next.getDate() + 1);
        if (weekdays.has(next.getDay())) return next;
      }
      // Unreachable when `weekdays` is non-empty (schema enforces `.min(1)`).
      return next;
    }
    case "MONTHLY": {
      const next = new Date(from);
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
      const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(rule.dayOfMonth, lastDayOfMonth));
      return next;
    }
  }
}
