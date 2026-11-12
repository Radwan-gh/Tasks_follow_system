export interface ArabicNoun {
  /** «لا لوحات» */
  zero: string;
  /** «لوحة واحدة» */
  one: string;
  /** «لوحتان» */
  two: string;
  /** Plural for 3–10: «لوحات». */
  few: string;
  /** Singular for 11 and up: «لوحة». */
  many: string;
}

export const BOARDS: ArabicNoun = { zero: "لا لوحات", one: "لوحة واحدة", two: "لوحتان", few: "لوحات", many: "لوحة" };
export const MEMBERS: ArabicNoun = { zero: "لا أعضاء", one: "عضو واحد", two: "عضوان", few: "أعضاء", many: "عضوًا" };
export const TASKS: ArabicNoun = { zero: "لا مهام", one: "مهمة واحدة", two: "مهمتان", few: "مهام", many: "مهمة" };

/**
 * «3 لوحات» but «11 لوحة» — Arabic counts take the plural only for 3–10, and
 * that by the last two digits, so 103 is «103 لوحات» and 111 «111 لوحة».
 */
export function countLabel(n: number, noun: ArabicNoun): string {
  if (n === 0) return noun.zero;
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  const lastTwo = n % 100;
  return `${n} ${lastTwo >= 3 && lastTwo <= 10 ? noun.few : noun.many}`;
}

export const RESULTS: ArabicNoun = { zero: "لا نتائج", one: "نتيجة واحدة", two: "نتيجتان", few: "نتائج", many: "نتيجة" };
export const STATUSES: ArabicNoun = { zero: "لا حالات", one: "حالة واحدة", two: "حالتين", few: "حالات", many: "حالة" };
