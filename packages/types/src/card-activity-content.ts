import { countLabel, type ArabicNoun } from "./arabic-count";
import type { CardActivity, CardPriority, RecurrenceRule } from "./domain";

/*
 * The Arabic wording of a card's history. Shared because the server writes some
 * of it into `CardActivity` rows (a recurrence rule is snapshotted as its
 * summary, the way a move snapshots list names) and both apps render the rest
 * — two copies of `describeCardActivity` had already been ported once and would
 * drift with every new event type.
 */

export const CARD_PRIORITY_LABELS: Record<CardPriority, string> = { LOW: "منخفض", NORMAL: "عادي", URGENT: "عاجل" };

/** 0 = Sunday, matching `RecurrenceRule.weekdays` and `Date.getDay()`. */
export const WEEKDAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** «يوميًا» · «أسبوعيًا: الأحد، الخميس» · «شهريًا: يوم 15». */
export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.freq) {
    case "DAILY":
      return "يوميًا";
    case "WEEKLY":
      return `أسبوعيًا: ${[...rule.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join("، ")}`;
    case "MONTHLY":
      return `شهريًا: يوم ${rule.dayOfMonth}`;
  }
}

/**
 * A `DUE_DATE_CHANGED` value: `YYYY-MM-DD` for a date-only due date, a full
 * ISO timestamp when it has a time of day (`dueDateHasTime`).
 */
function formatDueValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Noon UTC keeps the calendar day the same in every time zone.
    return new Date(`${value}T12:00:00Z`).toLocaleDateString("ar", { dateStyle: "medium" });
  }
  return new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

const priorityLabel = (value: string | null) => CARD_PRIORITY_LABELS[value as CardPriority] ?? value ?? "؟";

// Read after «بتأخير», so the dual is the genitive «يومين», not «يومان».
const DAYS: ArabicNoun = { zero: "", one: "يوم واحد", two: "يومين", few: "أيام", many: "يومًا" };
const HOURS: ArabicNoun = { zero: "", one: "ساعة واحدة", two: "ساعتين", few: "ساعات", many: "ساعة" };
const MINUTES: ArabicNoun = { zero: "", one: "دقيقة واحدة", two: "دقيقتين", few: "دقائق", many: "دقيقة" };

/**
 * A finished cycle's punctuality: «في الموعد», «بتأخير يومين», «بتأخير 3 ساعات»;
 * null when the cycle had no due date. A date-only due date is late by whole
 * calendar days (its deadline is the end of that day), so even an hour past it
 * reads «يوم واحد»; a timed one counts minutes, then hours, then days.
 */
export function formatLateness(lateMinutes: number | null, dueDateHasTime: boolean): string | null {
  if (lateMinutes === null) return null;
  if (lateMinutes <= 0) return "في الموعد";
  return `بتأخير ${formatLateBy(lateMinutes, dueDateHasTime)}`;
}

/** Just the amount — «يومين», «3 ساعات» — for a positive `lateMinutes`; see `formatLateness`. */
export function formatLateBy(lateMinutes: number, dueDateHasTime: boolean): string {
  if (!dueDateHasTime) return countLabel(Math.max(1, Math.ceil(lateMinutes / 1440)), DAYS);
  if (lateMinutes < 60) return countLabel(Math.max(1, lateMinutes), MINUTES);
  if (lateMinutes < 1440) return countLabel(Math.floor(lateMinutes / 60), HOURS);
  return countLabel(Math.floor(lateMinutes / 1440), DAYS);
}

/** One history event as an Arabic sentence, read after the actor's name. */
export function describeCardActivity(activity: Pick<CardActivity, "type" | "fromValue" | "toValue">): string {
  const { fromValue, toValue } = activity;
  switch (activity.type) {
    case "CREATED":
      return toValue ? `أنشأ البطاقة في «${toValue}»` : "أنشأ البطاقة";
    case "MOVED":
      return `نقل البطاقة من «${fromValue ?? "؟"}» إلى «${toValue ?? "؟"}»`;
    case "RENAMED":
      return `غيّر العنوان من «${fromValue ?? ""}» إلى «${toValue ?? ""}»`;
    case "DESCRIPTION_UPDATED":
      return "حدّث الوصف";
    case "DUE_DATE_CHANGED":
      return toValue ? `عيّن تاريخ الاستحقاق إلى ${formatDueValue(toValue)}` : "أزال تاريخ الاستحقاق";
    case "ARCHIVED":
      return "أرشف البطاقة";
    case "UNARCHIVED":
      return "أعاد البطاقة من الأرشيف";
    case "ASSIGNED":
      return toValue ? `أسند المهمة إلى ${toValue}` : "أسند المهمة";
    case "UNASSIGNED":
      return "أزال إسناد المهمة";
    case "COST_UPDATED":
      return toValue ? `حدّث التكلفة إلى ${toValue}` : "أزال التكلفة";
    case "PRIORITY_CHANGED":
      return `غيّر الأولوية من «${priorityLabel(fromValue)}» إلى «${priorityLabel(toValue)}»`;
    case "RECURRENCE_CHANGED":
      if (!toValue) return "أوقف تكرار المهمة";
      return fromValue ? `غيّر التكرار من «${fromValue}» إلى «${toValue}»` : `عيّن التكرار «${toValue}»`;
    case "BOARDS_CHANGED":
      return `غيّر لوحات المهمة من «${fromValue ?? "؟"}» إلى «${toValue ?? "؟"}»`;
    case "CYCLE_COMPLETED": {
      const done = fromValue ? `أنهى دورة المهمة ${fromValue}` : "أنهى دورة المهمة";
      return toValue ? `${done}، وأُعيد فتحها للدورة التالية بموعد ${formatDueValue(toValue)}` : done;
    }
    default:
      return "حدّث البطاقة";
  }
}
