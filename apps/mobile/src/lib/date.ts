const dayMonth = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" });

/** «12 مايو» — day + Arabic month name, no year, matching the card-face chip. */
export function formatDueDate(iso: string): string {
  return dayMonth.format(new Date(iso));
}

const weekdayDayMonth = new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" });

/** «الثلاثاء 12 مايو» — the task screen's due-date pill (6b). */
export function formatDueLong(iso: string): string {
  return weekdayDayMonth.format(new Date(iso));
}

export function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/**
 * «متأخّرة 9 أيام» · «متأخّرة 2 يوم» — whole calendar days since the due
 * date, at least one. Worded as the design's «مهامي» rows are: the plural
 * only for 3–10, the singular otherwise.
 */
export function overdueLabel(iso: string, now = new Date()): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(1, Math.round((startOf(now) - startOf(new Date(iso))) / 86400000));
  const lastTwo = days % 100;
  return `متأخّرة ${days} ${lastTwo >= 3 && lastTwo <= 10 ? "أيام" : "يوم"}`;
}
