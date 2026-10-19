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
