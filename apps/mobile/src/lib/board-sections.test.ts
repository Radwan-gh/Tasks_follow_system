import { describe, expect, it } from "vitest";
import { canManageBoardCategory, groupBoardsByCategory } from "@app/types";
import { BOARDS, TASKS, countLabel } from "./plural";

const mosque = { id: "c1", name: "الجامع", createdById: "u2" };
const school = { id: "c2", name: "المدرسة", createdById: "u2" };
const mine = { id: "c3", name: "البيت", createdById: "me" };

const board = (id: string, category: { id: string; name: string } | null) => ({ id, category });

describe("groupBoardsByCategory", () => {
  it("stays flat with no header when no board is categorised and the viewer made no category", () => {
    const boards = [board("b1", null), board("b2", null)];
    expect(groupBoardsByCategory(boards, [mosque], "me")).toEqual([{ category: null, boards }]);
  });

  it("returns nothing for no boards and no categories of the viewer's own", () => {
    expect(groupBoardsByCategory([], [mosque], "me")).toEqual([]);
  });

  it("sorts categories by name, keeps board order inside each, and puts «بلا تصنيف» last", () => {
    const sections = groupBoardsByCategory(
      [board("b1", null), board("b2", school), board("b3", mosque), board("b4", school)],
      [mosque, school],
      "me",
    );
    expect(sections.map((s) => [s.category?.name ?? null, s.boards.map((b) => b.id)])).toEqual([
      ["الجامع", ["b3"]],
      ["المدرسة", ["b2", "b4"]],
      [null, ["b1"]],
    ]);
  });

  it("shows an empty category only to the person who created it", () => {
    const boards = [board("b1", mosque)];
    expect(groupBoardsByCategory(boards, [mosque, school, mine], "me").map((s) => s.category?.id)).toEqual(["c3", "c1"]);
    expect(groupBoardsByCategory(boards, [mosque, school, mine], "u9").map((s) => s.category?.id)).toEqual(["c1"]);
  });

  it("omits «بلا تصنيف» when every board has a category", () => {
    const sections = groupBoardsByCategory([board("b1", mosque)], [mosque], "me");
    expect(sections.some((s) => s.category === null)).toBe(false);
  });

  it("uses the board's own embedded category even when the category list is stale", () => {
    expect(groupBoardsByCategory([board("b1", mosque)], [], "me")[0]?.category).toEqual(mosque);
  });
});

describe("canManageBoardCategory", () => {
  it("allows the creator and any admin, nobody else", () => {
    expect(canManageBoardCategory({ id: "u2", role: "USER" }, mosque)).toBe(true);
    expect(canManageBoardCategory({ id: "me", role: "ADMIN" }, mosque)).toBe(true);
    expect(canManageBoardCategory({ id: "me", role: "USER" }, mosque)).toBe(false);
    expect(canManageBoardCategory({ id: "me", role: "USER" }, { createdById: null })).toBe(false);
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
