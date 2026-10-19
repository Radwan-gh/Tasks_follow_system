import type { ArabicNoun } from "@app/types";

// `countLabel` lives in `@app/types` since the shared history wording counts days too.
export { countLabel, type ArabicNoun } from "@app/types";

export const BOARDS: ArabicNoun = { zero: "لا لوحات", one: "لوحة واحدة", two: "لوحتان", few: "لوحات", many: "لوحة" };
export const TASKS: ArabicNoun = { zero: "لا مهام", one: "مهمة واحدة", two: "مهمتان", few: "مهام", many: "مهمة" };
export const CYCLES: ArabicNoun = { zero: "لا دورات", one: "دورة واحدة", two: "دورتان", few: "دورات", many: "دورة" };
