import { describe, expect, it } from "vitest";
import { overdueLabel } from "./date";

describe("overdueLabel", () => {
  const now = new Date(2026, 4, 20, 15, 0);

  it("counts whole calendar days, as the design words them", () => {
    expect(overdueLabel(new Date(2026, 4, 11, 9, 0).toISOString(), now)).toBe("متأخّرة 9 أيام");
    expect(overdueLabel(new Date(2026, 4, 18, 23, 0).toISOString(), now)).toBe("متأخّرة 2 يوم");
    expect(overdueLabel(new Date(2026, 4, 5, 9, 0).toISOString(), now)).toBe("متأخّرة 15 يوم");
  });

  it("says one day for something due earlier today", () => {
    expect(overdueLabel(new Date(2026, 4, 20, 9, 0).toISOString(), now)).toBe("متأخّرة 1 يوم");
  });
});
