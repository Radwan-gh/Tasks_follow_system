/**
 * Date helpers for recurring tasks. All arithmetic is in UTC so a task's
 * "week" is stable regardless of server timezone; an occurrence is keyed by the
 * Monday 00:00 UTC of the week it belongs to.
 */

/** Monday 00:00:00.000 UTC of the ISO week containing `date`. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const shiftToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + shiftToMonday);
  return d;
}

/**
 * The previous calendar month as a half-open `[from, to)` range in UTC —
 * the default window for the completion report. `from` is the 1st of last
 * month 00:00 UTC; `to` is the 1st of this month 00:00 UTC (exclusive).
 */
export function previousMonthRange(now: Date): { from: Date; to: Date } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { from, to };
}
