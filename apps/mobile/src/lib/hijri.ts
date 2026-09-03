/**
 * §3c-2 "التاريخ الهجري": a secondary muted line under the due-date
 * picker/chip, Gregorian↔Hijri only, no library (`docs/13-redesign-completion-plan.md`'s
 * fixed scope decision). This is the tabular/civil Islamic calendar (the
 * common public-domain "Kuwaiti algorithm" arithmetic approximation used by
 * most JS Hijri conversions) — a fixed astronomical offset from the proleptic
 * Gregorian calendar via Julian Day Numbers. It can drift a day from the
 * Umm al-Qura calendar actually used for religious observance; fine for a
 * secondary informational line, not something to build moon-sighting logic
 * for.
 */

const HIJRI_MONTHS = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

const ISLAMIC_EPOCH_JDN = 1948440;

/** Gregorian date → `{ year, month (1-12), day }` in the tabular Hijri calendar. */
export function toHijri(date: Date): { year: number; month: number; day: number } {
  const jdn = gregorianToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
  let l = jdn - ISLAMIC_EPOCH_JDN + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/** «24 ذو القعدة 1447» — no leading "الموافق"; callers that want the design's full "الموافق ..." phrasing prepend it themselves. */
export function formatHijri(date: Date): string {
  const { year, month, day } = toHijri(date);
  return `${day} ${HIJRI_MONTHS[month - 1]} ${year}`;
}
