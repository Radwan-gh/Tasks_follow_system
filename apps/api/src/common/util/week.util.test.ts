import { describe, expect, it } from "vitest";
import { previousMonthRange, startOfIsoWeek } from "./week.util";

describe("startOfIsoWeek", () => {
  it("returns Monday 00:00 UTC for a mid-week date", () => {
    // Wednesday 2026-07-22
    expect(startOfIsoWeek(new Date("2026-07-22T15:30:00Z")).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z",
    );
  });

  it("returns the same Monday for that Monday", () => {
    expect(startOfIsoWeek(new Date("2026-07-20T00:00:00Z")).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z",
    );
  });

  it("treats Sunday as the end of the ISO week (rolls back to Monday)", () => {
    // Sunday 2026-07-26 belongs to the week starting Monday 2026-07-20
    expect(startOfIsoWeek(new Date("2026-07-26T23:59:00Z")).toISOString()).toBe(
      "2026-07-20T00:00:00.000Z",
    );
  });

  it("is idempotent and normalizes to midnight", () => {
    const once = startOfIsoWeek(new Date("2026-07-22T15:30:00Z"));
    expect(startOfIsoWeek(once).toISOString()).toBe(once.toISOString());
  });
});

describe("previousMonthRange", () => {
  it("returns the previous calendar month as [from, to)", () => {
    const { from, to } = previousMonthRange(new Date("2026-07-21T10:00:00Z"));
    expect(from.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("wraps across the year boundary", () => {
    const { from, to } = previousMonthRange(new Date("2026-01-15T10:00:00Z"));
    expect(from.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
