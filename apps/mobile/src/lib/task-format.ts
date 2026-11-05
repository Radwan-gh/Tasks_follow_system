/**
 * The task screen's wording for dates and times (`Edit Task Prototype.dc.html`):
 * a due date reads «اليوم» / «غدًا» / «12 مايو», or «متأخرة · 12 مايو» once it
 * has passed; an activity line reads «الآن» / «منذ ساعتين» / «أمس» / «3 أكتوبر».
 * Latin digits, as the prototype draws them.
 */

const dayMonth = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "long" });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from today to `iso`: 0 today, 1 tomorrow, -1 yesterday. */
export function daysFromToday(iso: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86_400_000);
}

export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso));
}

export type DueTone = "overdue" | "upcoming";

/** The due pill. A finished task is never «متأخرة». */
export function dueLabel(iso: string, done: boolean, now = new Date()): { text: string; tone: DueTone } {
  const days = daysFromToday(iso, now);
  if (days < 0 && !done) return { text: `متأخرة · ${formatDayMonth(iso)}`, tone: "overdue" };
  if (days === 0) return { text: "اليوم", tone: "upcoming" };
  if (days === 1) return { text: "غدًا", tone: "upcoming" };
  return { text: formatDayMonth(iso), tone: "upcoming" };
}

/** «دقيقة» → «منذ دقيقة», «منذ دقيقتين», «منذ 5 دقائق», «منذ 20 دقيقة». */
function countAgo(n: number, one: string, two: string, few: string): string {
  if (n === 1) return `منذ ${one}`;
  if (n === 2) return `منذ ${two}`;
  const lastTwo = n % 100;
  return `منذ ${n} ${lastTwo >= 3 && lastTwo <= 10 ? few : one}`;
}

/** When an activity happened, as the prototype words it. */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  const days = -daysFromToday(iso, now);
  if (days <= 0) {
    if (minutes < 1) return "الآن";
    if (minutes < 60) return countAgo(minutes, "دقيقة", "دقيقتين", "دقائق");
    return countAgo(Math.floor(minutes / 60), "ساعة", "ساعتين", "ساعات");
  }
  if (days === 1) return "أمس";
  return formatDayMonth(iso);
}

/** «12 كلمة» — the full-screen description's footer. */
export function wordCount(text: string): string {
  const n = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${n} كلمة`;
}

/** A due date `days` from today, stored at local noon like every deadline in the app. */
export function noonInDays(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
