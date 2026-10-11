import { describe, expect, it } from "vitest";
import type { CardBoardsResponse } from "@app/types";
import { boardChips, boardInitial, contextBoardId, listOnBoard, pickBoards, withMove } from "./card-boards";

const placements = [
  { boardId: "home", listId: "home-new" },
  { boardId: "other", listId: "other-new" },
];

describe("contextBoardId", () => {
  it("keeps the board the task was opened from while the task is on it", () => {
    expect(contextBoardId("other", placements, new Set())).toBe("other");
  });
  it("moves to a board of the user's once the task left the one it was opened from", () => {
    expect(contextBoardId("gone", placements, new Set(["other"]))).toBe("other");
    expect(contextBoardId("gone", placements, undefined)).toBe("home");
  });
  it("uses the opened board until the task has loaded", () => {
    expect(contextBoardId("gone", undefined, undefined)).toBe("gone");
  });
});

describe("listOnBoard and withMove", () => {
  const card = { boardId: "home", listId: "home-new", placements };
  it("reads the task's column on each board", () => {
    expect(listOnBoard(card, "other")).toBe("other-new");
    expect(listOnBoard(card, "unknown")).toBe("home-new");
  });
  it("moves only the board it was moved on — the server moves the rest", () => {
    const moved = withMove(card, "other", "other-doing");
    expect(moved.listId).toBe("home-new");
    expect(listOnBoard(moved, "other")).toBe("other-doing");
    expect(withMove(card, "home", "home-doing").listId).toBe("home-doing");
  });
});

describe("boardChips", () => {
  const data: CardBoardsResponse = {
    boards: [
      { id: "mine", name: "لوحتي", isArchived: false, canRemove: true },
      { id: "theirs", name: "لوحة غيري", isArchived: false, canRemove: false },
    ],
    canChange: true,
  };
  const names = new Map([["extra", "لوحة أخرى"]]);
  it("shows the task's boards and any just added, in order", () => {
    expect(boardChips(data, ["mine", "theirs", "extra"], names).map((c) => c.name)).toEqual([
      "لوحتي",
      "لوحة غيري",
      "لوحة أخرى",
    ]);
  });
  it("offers ✕ only where the server would allow it", () => {
    // Not on a board the user is not a member of, nor on the last of their own.
    expect(boardChips(data, ["mine", "theirs"], names).map((c) => c.removable)).toEqual([false, false]);
    expect(boardChips(data, ["mine", "theirs", "extra"], names).map((c) => c.removable)).toEqual([true, false, true]);
  });
  it("offers nothing to someone who cannot change the boards", () => {
    expect(boardChips({ ...data, canChange: false }, ["mine", "extra"], names).some((c) => c.removable)).toBe(false);
  });
});

describe("pickBoards", () => {
  const options = ["الجامع", "الكهرباء", "الماء", "النظافة", "الحديقة"].map((name, i) => ({ id: `b${i}`, name }));
  it("offers the three latest-used boards before anything is typed", () => {
    expect(pickBoards(options, [], "").map((b) => b.name)).toEqual(["الجامع", "الكهرباء", "الماء"]);
  });
  it("searches every board by name, leaving out the ones the task is on", () => {
    expect(pickBoards(options, ["b0"], "ال").map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(pickBoards(options, [], "  نظافة ").map((b) => b.name)).toEqual(["النظافة"]);
    expect(pickBoards(options, ["b1"], "")).toHaveLength(3);
  });
});

describe("boardInitial", () => {
  it("skips the article so boards don't all read «ا»", () => {
    expect(boardInitial("الكهرباء")).toBe("ك");
    expect(boardInitial("الجامع الكبير")).toBe("ج");
    expect(boardInitial("مشروع المدرسة")).toBe("م");
    expect(boardInitial("الف")).toBe("ا");
    expect(boardInitial("maintenance")).toBe("M");
  });
});
