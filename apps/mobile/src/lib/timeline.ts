/**
 * 6d «التعليقات والسجل»: comments and history events in one timeline, newest
 * first, broken up by day markers («اليوم», «أمس», then the date), and
 * narrowed by the «الكل · التعليقات · السجل» chips.
 */

export type TimelineFilter = "all" | "comments" | "history";

export type TimelineEntry<A, C> =
  | { kind: "day"; key: string; label: string }
  | { kind: "activity"; key: string; createdAt: string; activity: A }
  | { kind: "comment"; key: string; createdAt: string; comment: C };

const weekdayDate = new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** «اليوم» · «أمس» · «الأحد 3 نوفمبر». */
export function dayLabel(iso: string, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days === 0) return "اليوم";
  if (days === 1) return "أمس";
  return weekdayDate.format(new Date(iso));
}

/** A day key in local time — two events share a marker when they share this. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function buildTimeline<A extends { id: string; createdAt: string }, C extends { id: string; createdAt: string }>(
  activities: readonly A[],
  comments: readonly C[],
  filter: TimelineFilter,
  now = new Date(),
): TimelineEntry<A, C>[] {
  const rows: Exclude<TimelineEntry<A, C>, { kind: "day" }>[] = [
    ...(filter === "comments" ? [] : activities.map((activity) => ({ kind: "activity" as const, key: `a:${activity.id}`, createdAt: activity.createdAt, activity }))),
    ...(filter === "history" ? [] : comments.map((comment) => ({ kind: "comment" as const, key: `c:${comment.id}`, createdAt: comment.createdAt, comment }))),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const out: TimelineEntry<A, C>[] = [];
  let lastDay: string | null = null;
  for (const row of rows) {
    const key = dayKey(row.createdAt);
    if (key !== lastDay) {
      out.push({ kind: "day", key: `d:${key}`, label: dayLabel(row.createdAt, now) });
      lastDay = key;
    }
    out.push(row);
  }
  return out;
}
