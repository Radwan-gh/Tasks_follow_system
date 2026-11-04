import { describe, expect, it } from "vitest";
import { anyBoardOpen, summarizeFoldedGroup, toggleAllBoards, toggleFoldedBoard } from "@app/types";

describe("summarizeFoldedGroup", () => {
  it("counts urgent rows and picks the earliest due date", () => {
    const summary = summarizeFoldedGroup([
      { priority: "URGENT", dueDate: "2026-05-22T09:00:00.000Z" },
      { priority: "NORMAL", dueDate: "2026-05-18T09:00:00.000Z" },
      { priority: "URGENT", dueDate: null },
      { priority: "NORMAL", dueDate: null },
    ]);
    expect(summary).toEqual({ urgentCount: 2, nextDueDate: "2026-05-18T09:00:00.000Z" });
  });

  it("has no due date when no row carries one", () => {
    expect(summarizeFoldedGroup([{ priority: "NORMAL", dueDate: null }])).toEqual({ urgentCount: 0, nextDueDate: null });
  });
});

describe("toggleFoldedBoard", () => {
  it("folds an open board and unfolds a folded one", () => {
    const folded = toggleFoldedBoard(new Set(), "b1", ["b1", "b2"]);
    expect([...folded]).toEqual(["b1"]);
    expect([...toggleFoldedBoard(folded, "b1", ["b1", "b2"])]).toEqual([]);
  });

  it("drops boards that are no longer shown", () => {
    expect([...toggleFoldedBoard(new Set(["gone", "b2"]), "b1", ["b1", "b2"])].sort()).toEqual(["b1", "b2"]);
  });
});

describe("toggleAllBoards", () => {
  it("folds every shown board while any is open", () => {
    const live = ["b1", "b2", "b3"];
    expect(anyBoardOpen(new Set(["b1"]), live)).toBe(true);
    expect([...toggleAllBoards(new Set(["b1"]), live)]).toEqual(live);
  });

  it("opens everything once all are folded", () => {
    const live = ["b1", "b2"];
    expect(anyBoardOpen(new Set(live), live)).toBe(false);
    expect([...toggleAllBoards(new Set(live), live)]).toEqual([]);
  });
});
