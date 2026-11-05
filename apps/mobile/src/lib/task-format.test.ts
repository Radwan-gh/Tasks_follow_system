import { describe, expect, it } from "vitest";
import { daysFromToday, dueLabel, noonInDays, relativeTime, wordCount } from "./task-format";

const now = new Date(2026, 9, 14, 15, 30);
const at = (month: number, day: number, hour = 12, minute = 0) => new Date(2026, month, day, hour, minute).toISOString();

describe("dueLabel", () => {
  it("says today and tomorrow", () => {
    expect(dueLabel(at(9, 14), false, now)).toEqual({ text: "اليوم", tone: "upcoming" });
    expect(dueLabel(at(9, 15), false, now)).toEqual({ text: "غدًا", tone: "upcoming" });
  });

  it("marks a passed date overdue, unless the task is done", () => {
    expect(dueLabel(at(9, 10), false, now).tone).toBe("overdue");
    expect(dueLabel(at(9, 10), false, now).text.startsWith("متأخرة · ")).toBe(true);
    expect(dueLabel(at(9, 10), true, now).tone).toBe("upcoming");
  });
});

describe("relativeTime", () => {
  it("counts minutes and hours today with Arabic number agreement", () => {
    expect(relativeTime(at(9, 14, 15, 30), now)).toBe("الآن");
    expect(relativeTime(at(9, 14, 15, 29), now)).toBe("منذ دقيقة");
    expect(relativeTime(at(9, 14, 15, 28), now)).toBe("منذ دقيقتين");
    expect(relativeTime(at(9, 14, 15, 25), now)).toBe("منذ 5 دقائق");
    expect(relativeTime(at(9, 14, 15, 10), now)).toBe("منذ 20 دقيقة");
    expect(relativeTime(at(9, 14, 13, 30), now)).toBe("منذ ساعتين");
    expect(relativeTime(at(9, 14, 10, 0), now)).toBe("منذ 5 ساعات");
  });

  it("says yesterday, then the date", () => {
    expect(relativeTime(at(9, 13, 23, 0), now)).toBe("أمس");
    expect(relativeTime(at(9, 2), now)).not.toBe("أمس");
  });
});

describe("helpers", () => {
  it("counts words", () => {
    expect(wordCount("")).toBe("0 كلمة");
    expect(wordCount(" مراجعة  النصوص \n قبل ")).toBe("3 كلمة");
  });

  it("puts deadlines at local noon, n days out", () => {
    const iso = noonInDays(7, now);
    expect(new Date(iso).getHours()).toBe(12);
    expect(daysFromToday(iso, now)).toBe(7);
  });
});
