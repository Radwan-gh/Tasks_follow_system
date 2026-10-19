import { describe, expect, it } from "vitest";
import { completesCycle, reopenedNotice } from "./recurring";

const lists = [
  { id: "new", name: "جديد" },
  { id: "closed", name: "انتهى" },
];

describe("completesCycle", () => {
  it("is a recurring task going into «انتهى»", () => {
    expect(completesCycle({ recurrence: { freq: "DAILY" } }, { statusCategory: "CLOSED" })).toBe(true);
  });
  it("is not an ordinary task, nor any other status", () => {
    expect(completesCycle({ recurrence: null }, { statusCategory: "CLOSED" })).toBe(false);
    expect(completesCycle({ recurrence: { freq: "DAILY" } }, { statusCategory: "DONE" })).toBe(false);
    expect(completesCycle({ recurrence: { freq: "DAILY" } }, undefined)).toBe(false);
  });
});

describe("reopenedNotice", () => {
  it("says nothing when the task stayed where it was sent", () => {
    const moved = { listId: "closed", placements: [{ boardId: "b", listId: "closed" }], dueDate: null };
    expect(reopenedNotice(moved, "b", lists, "closed")).toBeNull();
  });
  it("names the column the task came back to, and its next due date", () => {
    const moved = { listId: "new", placements: [{ boardId: "b", listId: "new" }], dueDate: "2026-10-17T00:00:00.000Z" };
    const notice = reopenedNotice(moved, "b", lists, "closed");
    expect(notice).toMatch(/^اكتملت الدورة، وعادت المهمة إلى «جديد» بموعد /);
  });
  it("leaves the date out when there is none", () => {
    const moved = { listId: "new", placements: [{ boardId: "b", listId: "new" }], dueDate: null };
    expect(reopenedNotice(moved, "b", lists, "closed")).toBe("اكتملت الدورة، وعادت المهمة إلى «جديد»");
  });
});
