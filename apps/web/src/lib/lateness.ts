/**
 * Mirrors `formatLateness` / `formatLateBy` / `countLabel` from `packages/types`
 * (`card-activity-content.ts`, `arabic-count.ts`) — a local copy for the same
 * bundle-size reason as `describe-notification.ts`: a runtime import from the
 * CommonJS `@app/types` drags the whole package into the client bundle. Keep
 * this in sync by hand if the shared wording changes.
 */

interface ArabicNoun {
  zero: string;
  one: string;
  two: string;
  few: string;
  many: string;
}

/** «3 أيام» but «11 يومًا» — the plural only for 3–10, by the last two digits. */
export function countLabel(n: number, noun: ArabicNoun): string {
  if (n === 0) return noun.zero;
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  const lastTwo = n % 100;
  return `${n} ${lastTwo >= 3 && lastTwo <= 10 ? noun.few : noun.many}`;
}

export const CYCLES: ArabicNoun = { zero: "لا دورات", one: "دورة واحدة", two: "دورتان", few: "دورات", many: "دورة" };

// Read after «بتأخير», so the dual is the genitive «يومين».
const DAYS: ArabicNoun = { zero: "", one: "يوم واحد", two: "يومين", few: "أيام", many: "يومًا" };
const HOURS: ArabicNoun = { zero: "", one: "ساعة واحدة", two: "ساعتين", few: "ساعات", many: "ساعة" };
const MINUTES: ArabicNoun = { zero: "", one: "دقيقة واحدة", two: "دقيقتين", few: "دقائق", many: "دقيقة" };

/** «في الموعد», «بتأخير يومين»; null when the cycle had no due date. */
export function formatLateness(lateMinutes: number | null, dueDateHasTime: boolean): string | null {
  if (lateMinutes === null) return null;
  if (lateMinutes <= 0) return "في الموعد";
  return `بتأخير ${formatLateBy(lateMinutes, dueDateHasTime)}`;
}

/** Just the amount — «يومين», «3 ساعات» — whole days for a date-only due date. */
export function formatLateBy(lateMinutes: number, dueDateHasTime: boolean): string {
  if (!dueDateHasTime) return countLabel(Math.max(1, Math.ceil(lateMinutes / 1440)), DAYS);
  if (lateMinutes < 60) return countLabel(Math.max(1, lateMinutes), MINUTES);
  if (lateMinutes < 1440) return countLabel(Math.floor(lateMinutes / 60), HOURS);
  return countLabel(Math.floor(lateMinutes / 1440), DAYS);
}
