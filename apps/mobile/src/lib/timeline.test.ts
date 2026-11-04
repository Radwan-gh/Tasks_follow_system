import { describe, expect, it } from "vitest";
import { buildTimeline, dayLabel } from "./timeline";

const now = new Date(2026, 4, 12, 15, 0);
const at = (day: number, hour: number) => new Date(2026, 4, day, hour, 0).toISOString();

describe("dayLabel", () => {
  it("names today and yesterday", () => {
    expect(dayLabel(at(12, 9), now)).toBe("اليوم");
    expect(dayLabel(at(11, 23), now)).toBe("أمس");
  });
});

describe("buildTimeline", () => {
  const activities = [
    { id: "created", createdAt: at(11, 15) },
    { id: "moved", createdAt: at(12, 10) },
  ];
  const comments = [
    { id: "c1", createdAt: at(12, 11) },
    { id: "c2", createdAt: at(11, 16) },
  ];

  it("merges both kinds newest first with a marker per day", () => {
    const rows = buildTimeline(activities, comments, "all", now);
    expect(rows.map((r) => (r.kind === "day" ? r.label : r.key))).toEqual([
      "اليوم",
      "c:c1",
      "a:moved",
      "أمس",
      "c:c2",
      "a:created",
    ]);
  });

  it("keeps only one kind when filtered", () => {
    expect(buildTimeline(activities, comments, "comments", now).filter((r) => r.kind !== "day").map((r) => r.key)).toEqual([
      "c:c1",
      "c:c2",
    ]);
    expect(buildTimeline(activities, comments, "history", now).filter((r) => r.kind !== "day").map((r) => r.key)).toEqual([
      "a:moved",
      "a:created",
    ]);
  });

  it("is empty when there is nothing", () => {
    expect(buildTimeline([], [], "all", now)).toEqual([]);
  });
});
