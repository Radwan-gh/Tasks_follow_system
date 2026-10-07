import { describe, expect, it } from "vitest";
import { isSimilarBoardName, normalizeBoardName } from "@app/types";

describe("normalizeBoardName", () => {
  it("drops diacritics and tatweel", () => {
    expect(normalizeBoardName("الهَدْيُ النَّبَوِيّ")).toBe("الهدي النبوي");
    expect(normalizeBoardName("الهـــدي")).toBe("الهدي");
  });

  it("unifies hamza-carrying alefs, ta marbuta and alef maqsura", () => {
    expect(normalizeBoardName("أإآٱ")).toBe("اااا");
    expect(normalizeBoardName("مدرسة")).toBe("مدرسه");
    expect(normalizeBoardName("مستشفى")).toBe("مستشفي");
  });

  it("ignores Latin case and extra whitespace", () => {
    expect(normalizeBoardName("  Team   Alpha ")).toBe("team alpha");
  });
});

describe("isSimilarBoardName", () => {
  it("matches names that differ only in spelling", () => {
    expect(isSimilarBoardName("الهدي النبوي", "الهَدْي النبويّ")).toBe(true);
    expect(isSimilarBoardName("صيانة المدرسة", "صيانه المدرسه")).toBe(true);
    expect(isSimilarBoardName("إدارة المسجد", "ادارة المسجد")).toBe(true);
  });

  it("matches with or without the definite article", () => {
    expect(isSimilarBoardName("الهدي النبوي", "هدي نبوي")).toBe(true);
    expect(isSimilarBoardName("الماء", "ماء")).toBe(true);
  });

  it("matches when one name is a run of words inside the other", () => {
    expect(isSimilarBoardName("لوحة الهدي النبوي", "الهدي النبوي")).toBe(true);
    expect(isSimilarBoardName("الهدي النبوي", "مشروع الهدي النبوي 2026")).toBe(true);
  });

  it("matches whole words only", () => {
    expect(isSimilarBoardName("طعام", "عام")).toBe(false);
    expect(isSimilarBoardName("الهدي النبوي", "الهدي")).toBe(true);
    expect(isSimilarBoardName("الهدي النبوي", "النبوي الهدي")).toBe(false);
  });

  it("never matches an empty name", () => {
    expect(isSimilarBoardName("", "الهدي")).toBe(false);
    expect(isSimilarBoardName("ـــ", "الهدي")).toBe(false);
  });
});
