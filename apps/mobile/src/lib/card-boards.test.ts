import { describe, expect, it } from "vitest";
import type { CardBoardsResponse } from "@app/types";
import { boardRows, contextBoardId, listOnBoard, withMove } from "./card-boards";

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

describe("boardRows", () => {
  const data: CardBoardsResponse = {
    boards: [
      { id: "mine", name: "لوحتي", isArchived: false, canRemove: true },
      { id: "theirs", name: "لوحة غيري", isArchived: false, canRemove: false },
    ],
    options: [{ id: "extra", name: "لوحة أخرى", isArchived: false }],
    canChange: true,
  };
  it("lists the task's boards first, then the ones it could join", () => {
    expect(boardRows(data, ["mine", "theirs"]).map((r) => [r.id, r.checked])).toEqual([
      ["mine", true],
      ["theirs", true],
      ["extra", false],
    ]);
  });
  it("locks a board the user is not on, and the last of their own", () => {
    const rows = boardRows(data, ["mine", "theirs"]);
    expect(rows.map((r) => r.lock)).toEqual(["lastOfMine", "notMember", null]);
  });
  it("frees their own board once another of theirs is ticked", () => {
    expect(boardRows(data, ["mine", "theirs", "extra"]).map((r) => r.lock)).toEqual([null, "notMember", null]);
  });
});
