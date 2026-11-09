import { describe, expect, it } from "vitest";
import {
  activeMention,
  displayUrl,
  linkAt,
  linkMarkup,
  parseRichText,
  removeLink,
  toggleBold,
  toggleLineStyle,
} from "./rich-text";

describe("parseRichText", () => {
  it("leaves plain text as one segment", () => {
    expect(parseRichText("مراجعة النصوص")).toEqual([{ kind: "text", text: "مراجعة النصوص" }]);
  });

  it("finds a bare URL and gives trailing punctuation back to the sentence", () => {
    const text = "المسودة: https://docs.google.com/landing-copy.";
    const segments = parseRichText(text);
    expect(segments).toEqual([
      { kind: "text", text: "المسودة: " },
      { kind: "link", label: "docs.google.com/landing-copy", url: "https://docs.google.com/landing-copy", start: 9, end: 45 },
      { kind: "text", text: "." },
    ]);
  });

  it("reads a labelled link and bold text", () => {
    const segments = parseRichText("مع [دليل العلامة](https://brand.example/guide) و**مهم**");
    expect(segments).toEqual([
      { kind: "text", text: "مع " },
      { kind: "link", label: "دليل العلامة", url: "https://brand.example/guide", start: 3, end: 46 },
      { kind: "text", text: " و" },
      { kind: "text", text: "مهم", bold: true },
    ]);
  });

  it("marks a mention only for a known name, preferring the longest", () => {
    const segments = parseRichText("@عبد الله ابدأ و@غريب", ["عبد", "عبد الله"]);
    expect(segments).toEqual([
      { kind: "mention", text: "@عبد الله" },
      { kind: "text", text: " ابدأ و@غريب" },
    ]);
  });

  it("does not treat an @ inside a word as a mention", () => {
    expect(parseRichText("mail@سارة", ["سارة"])).toEqual([{ kind: "text", text: "mail@سارة" }]);
  });
});

describe("link helpers", () => {
  it("strips the scheme for display", () => {
    expect(displayUrl("https://figma.com/landing/")).toBe("figma.com/landing");
  });

  it("finds the link under the cursor", () => {
    const text = "انظر https://a.example/x هنا";
    expect(linkAt(text, 10)?.url).toBe("https://a.example/x");
    expect(linkAt(text, 2)).toBeNull();
  });

  it("removes a labelled link but keeps its label", () => {
    const text = "مع [الدليل](https://a.example) الآن";
    const link = linkAt(text, 5)!;
    expect(removeLink(text, link).text).toBe("مع الدليل الآن");
  });

  it("removes a bare URL entirely", () => {
    const text = "انظر https://a.example هنا";
    const link = linkAt(text, 8)!;
    expect(removeLink(text, link).text).toBe("انظر  هنا");
  });

  it("builds link markup, adding a scheme when missing", () => {
    expect(linkMarkup("الدليل", "a.example")).toBe("[الدليل](https://a.example)");
    expect(linkMarkup("", "https://a.example")).toBe("https://a.example");
  });
});

describe("toolbar edits", () => {
  it("wraps and unwraps a selection in bold", () => {
    const wrapped = toggleBold("أ ب ج", { start: 2, end: 3 });
    expect(wrapped.text).toBe("أ **ب** ج");
    expect(toggleBold(wrapped.text, wrapped.selection).text).toBe("أ ب ج");
  });

  it("opens an empty bold pair at the cursor", () => {
    expect(toggleBold("أب", { start: 1, end: 1 })).toEqual({ text: "أ****ب", selection: { start: 3, end: 3 } });
  });

  it("bullets every touched line, then removes them", () => {
    const text = "أول\nثاني\nثالث";
    const on = toggleLineStyle(text, { start: 0, end: 6 }, "bullet");
    expect(on.text).toBe("• أول\n• ثاني\nثالث");
    expect(toggleLineStyle(on.text, { start: 0, end: 8 }, "bullet").text).toBe("أول\nثاني\nثالث");
  });

  it("numbers lines from 1 and swaps an existing list style", () => {
    expect(toggleLineStyle("• أ\n• ب", { start: 0, end: 7 }, "number").text).toBe("1. أ\n2. ب");
  });

  it("adds a tick box to the cursor's line only", () => {
    expect(toggleLineStyle("أ\nب", { start: 2, end: 2 }, "check").text).toBe("أ\n☐ ب");
  });
});

describe("activeMention", () => {
  it("returns the name being typed after @", () => {
    expect(activeMention("مرحبا @عب", 9)).toEqual({ start: 6, query: "عب" });
  });

  it("ignores an @ inside a word or after a line break", () => {
    expect(activeMention("mail@x", 6)).toBeNull();
    expect(activeMention("@أ\nب", 4)).toBeNull();
  });
});
