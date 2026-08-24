import { describe, expect, it } from "vitest";
import { COMPLETED_CATEGORIES, ListStatusCategory, isCompleted } from "./domain";

describe("isCompleted", () => {
  it("treats DONE and CLOSED as finished work", () => {
    expect(isCompleted("DONE")).toBe(true);
    expect(isCompleted("CLOSED")).toBe(true);
  });

  it("treats every other status as still open", () => {
    expect(isCompleted("NEW")).toBe(false);
    expect(isCompleted("READY")).toBe(false);
    expect(isCompleted("IN_PROGRESS")).toBe(false);
    // "بانتظار تقييم" is waiting on someone, which is the opposite of finished.
    expect(isCompleted("REVIEW")).toBe(false);
  });

  it("treats a manually created list as open", () => {
    // Lists created outside a template carry no category. Reports have always
    // counted them as not-done; keep that.
    expect(isCompleted(null)).toBe(false);
    expect(isCompleted(undefined)).toBe(false);
  });

  it("agrees with COMPLETED_CATEGORIES for every category in the enum", () => {
    // The Prisma `in:` filters use the array while application code uses the
    // predicate. If they ever disagreed, "open" would mean two different things
    // depending on which one a query happened to reach for.
    for (const category of ListStatusCategory.options) {
      expect(isCompleted(category)).toBe(
        (COMPLETED_CATEGORIES as readonly string[]).includes(category),
      );
    }
  });
});
