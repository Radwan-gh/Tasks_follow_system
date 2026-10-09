import { describe, expect, it } from "vitest";
import { canManageBoardCategories, categoryMoveFor, groupBoardsByCategory } from "@app/types";
import { BOARDS, TASKS, countLabel } from "./plural";

const mosque = { id: "c1", name: "الجامع" };
const school = { id: "c2", name: "المدرسة" };
const home = { id: "c3", name: "البيت" };

const board = (id: string, category: { id: string; name: string } | null) => ({ id, category });

describe("groupBoardsByCategory", () => {
  it("stays flat with no header for a non-admin when no board is categorised", () => {
    const boards = [board("b1", null), board("b2", null)];
    expect(groupBoardsByCategory(boards, [mosque], { includeEmpty: false })).toEqual([{ category: null, boards }]);
  });

  it("returns nothing for a non-admin with no boards", () => {
    expect(groupBoardsByCategory([], [mosque], { includeEmpty: false })).toEqual([]);
  });

  it("orders sections as `categories` does, keeps board order inside each, and puts «بلا تصنيف» last", () => {
    const sections = groupBoardsByCategory(
      [board("b1", null), board("b2", school), board("b3", mosque), board("b4", school)],
      [mosque, school],
      { includeEmpty: false },
    );
    expect(sections.map((s) => [s.category?.name ?? null, s.boards.map((b) => b.id)])).toEqual([
      ["الجامع", ["b3"]],
      ["المدرسة", ["b2", "b4"]],
      [null, ["b1"]],
    ]);
  });

  it("shows empty categories only when asked to (admins)", () => {
    const boards = [board("b1", mosque)];
    expect(groupBoardsByCategory(boards, [mosque, school, home], { includeEmpty: true }).map((s) => s.category?.id)).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(groupBoardsByCategory(boards, [mosque, school, home], { includeEmpty: false }).map((s) => s.category?.id)).toEqual([
      "c1",
    ]);
  });

  it("follows the admin-set order, not the alphabet", () => {
    const boards = [board("b1", mosque), board("b2", home)];
    // «البيت» sorts before «الجامع» by name, but the admin put it second.
    expect(groupBoardsByCategory(boards, [mosque, home], { includeEmpty: false }).map((s) => s.category?.id)).toEqual([
      "c1",
      "c3",
    ]);
  });

  it("puts a category missing from a stale list last", () => {
    const boards = [board("b1", school), board("b2", mosque)];
    expect(groupBoardsByCategory(boards, [mosque], { includeEmpty: false }).map((s) => s.category?.id)).toEqual(["c1", "c2"]);
  });

  it("omits «بلا تصنيف» when every board has a category", () => {
    const sections = groupBoardsByCategory([board("b1", mosque)], [mosque], { includeEmpty: true });
    expect(sections.some((s) => s.category === null)).toBe(false);
  });

  it("uses the board's own embedded category even when the category list is stale", () => {
    expect(groupBoardsByCategory([board("b1", mosque)], [], { includeEmpty: false })[0]?.category).toEqual(mosque);
  });
});

describe("canManageBoardCategories", () => {
  it("allows admins only", () => {
    expect(canManageBoardCategories({ role: "ADMIN" })).toBe(true);
    expect(canManageBoardCategories({ role: "USER" })).toBe(false);
  });
});

describe("categoryMoveFor", () => {
  const ids = ["a", "b", "c", "d"];
  it("moves up between the two items above", () => {
    expect(categoryMoveFor(ids, "c", "up")).toEqual({ beforeId: "a", afterId: "b" });
    expect(categoryMoveFor(ids, "b", "up")).toEqual({ beforeId: null, afterId: "a" });
  });
  it("moves down between the two items below", () => {
    expect(categoryMoveFor(ids, "b", "down")).toEqual({ beforeId: "c", afterId: "d" });
    expect(categoryMoveFor(ids, "c", "down")).toEqual({ beforeId: "d", afterId: null });
  });
  it("returns null at either end or for an unknown id", () => {
    expect(categoryMoveFor(ids, "a", "up")).toBeNull();
    expect(categoryMoveFor(ids, "d", "down")).toBeNull();
    expect(categoryMoveFor(ids, "x", "up")).toBeNull();
  });
});

describe("countLabel", () => {
  it("follows Arabic number agreement", () => {
    expect([0, 1, 2, 3, 10, 11, 24, 103, 111].map((n) => countLabel(n, BOARDS))).toEqual([
      "لا لوحات",
      "لوحة واحدة",
      "لوحتان",
      "3 لوحات",
      "10 لوحات",
      "11 لوحة",
      "24 لوحة",
      "103 لوحات",
      "111 لوحة",
    ]);
    expect(countLabel(8, TASKS)).toBe("8 مهام");
  });
});
