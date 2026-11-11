import { describe, expect, it } from "vitest";
import { findSearchMatch, foldForSearch, plainSearchText, searchSnippet } from "@app/types";

describe("foldForSearch", () => {
  it("folds alef/teh marbuta/alef maqsura forms, lower-cases and drops tashkeel", () => {
    expect(foldForSearch("أسعارُ الإسمنت").folded).toBe("اسعار الاسمنت");
    expect(foldForSearch("مدرسـة الهُدى").folded).toBe("مدرسه الهدي");
    expect(foldForSearch("Pump REPAIR").folded).toBe("pump repair");
  });

  it("maps every folded character back to its index in the original", () => {
    const { folded, origin } = foldForSearch("بُنى");
    expect(folded).toBe("بني");
    expect(origin).toEqual([0, 2, 3, 4]);
  });
});

describe("findSearchMatch", () => {
  it("finds a term typed without hamza or tashkeel", () => {
    const text = "شراء أسعارِ القواطع";
    const match = findSearchMatch(text, "اسعار");
    expect(match).not.toBeNull();
    // The highlight covers the original letters, including the trailing kasra.
    expect(text.slice(match!.start, match!.end)).toBe("أسعارِ");
  });

  it("is case-insensitive and ignores surrounding spaces in the query", () => {
    const text = "Replace the Pump";
    const match = findSearchMatch(text, "  pump ");
    expect(text.slice(match!.start, match!.end)).toBe("Pump");
  });

  it("returns null when there is no match or the query is blank", () => {
    expect(findSearchMatch("قاطع", "مضخة")).toBeNull();
    expect(findSearchMatch("قاطع", "   ")).toBeNull();
  });
});

describe("plainSearchText", () => {
  it("drops the task screen's markup and line breaks", () => {
    expect(plainSearchText("**مهم**: راجع [العرض](https://example.com/x)\nثم أرسل")).toBe("مهم: راجع العرض ثم أرسل");
  });
});

describe("searchSnippet", () => {
  it("returns the whole text when it is short", () => {
    expect(searchSnippet("تبديل القاطع الرئيسي", "القاطع")).toBe("تبديل القاطع الرئيسي");
  });

  it("cuts long text around the match at word boundaries, marking the cuts", () => {
    const before = "كلمة ".repeat(20);
    const after = " نص".repeat(20);
    const snippet = searchSnippet(`${before}المضخة${after}`, "مضخه", 20)!;
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("المضخة");
    // Starts on a whole word, not half of one.
    expect(snippet.split(" ")[0]).toBe("…كلمة");
  });

  it("is null when the match was only inside a link's URL", () => {
    expect(searchSnippet("[العرض](https://pump.example.com)", "pump")).toBeNull();
  });
});
