import { describe, expect, it } from "vitest";
import type { BoardDetail } from "@app/types";
import { mergeBoardColumns } from "./all-boards";

type Status = "NEW" | "READY" | "REVIEW" | "IN_PROGRESS" | "DONE" | "CLOSED" | null;

function card(id: string, extra: { assigneeIds?: string[]; isArchived?: boolean } = {}) {
  return { id, title: id, isArchived: extra.isArchived ?? false, assigneeIds: extra.assigneeIds ?? [] };
}

function board(
  id: string,
  lists: { id: string; status: Status; archived?: boolean; cards: ReturnType<typeof card>[] }[],
  extra: { ownerId?: string; role?: "OWNER" | "MEMBER" | "VIEWER"; isArchived?: boolean; supervised?: boolean } = {},
) {
  return {
    id,
    name: `لوحة ${id}`,
    ownerId: extra.ownerId ?? "owner",
    isArchived: extra.isArchived ?? false,
    supervised: extra.supervised ?? false,
    members: [{ userId: "me", role: extra.role ?? "MEMBER" }],
    lists: lists.map((l) => ({ id: l.id, name: l.id, isArchived: l.archived ?? false, statusCategory: l.status, cards: l.cards })),
  } as unknown as BoardDetail;
}

const STANDARD = (b: string, cards: Partial<Record<"NEW" | "IN_PROGRESS" | "DONE" | "CLOSED", ReturnType<typeof card>[]>>) =>
  board(b, [
    { id: `${b}-new`, status: "NEW", cards: cards.NEW ?? [] },
    { id: `${b}-ready`, status: "READY", cards: [] },
    { id: `${b}-doing`, status: "IN_PROGRESS", cards: cards.IN_PROGRESS ?? [] },
    { id: `${b}-done`, status: "DONE", cards: cards.DONE ?? [] },
    { id: `${b}-closed`, status: "CLOSED", cards: cards.CLOSED ?? [] },
  ]);

describe("mergeBoardColumns", () => {
  it("merges boards by status, in board order, five standard columns always", () => {
    const columns = mergeBoardColumns(
      [STANDARD("a", { NEW: [card("a1")], DONE: [card("a2")] }), STANDARD("b", { NEW: [card("b1")] })],
      "me",
    );
    expect(columns.map((c) => c.name)).toEqual(["جديد", "جاهز", "قيد التنفيذ", "منجز", "انتهى"]);
    expect(columns[0]!.cards.map((c) => [c.card.id, c.boardName, c.nextListId])).toEqual([
      ["a1", "لوحة a", "a-ready"],
      ["b1", "لوحة b", "b-ready"],
    ]);
  });

  it("adds «مراجعة» and «أخرى» only when they hold tasks, and skips archived lists and cards", () => {
    const columns = mergeBoardColumns(
      [
        board("a", [
          { id: "n", status: "NEW", cards: [card("x", { isArchived: true })] },
          { id: "r", status: "REVIEW", cards: [card("rev")] },
          { id: "mine", status: null, cards: [card("own")] },
          { id: "old", status: "NEW", archived: true, cards: [card("hidden")] },
        ]),
      ],
      "me",
    );
    expect(columns.map((c) => [c.key, c.cards.map((m) => m.card.id)])).toEqual([
      ["NEW", []],
      ["READY", []],
      ["REVIEW", ["rev"]],
      ["IN_PROGRESS", []],
      ["DONE", []],
      ["CLOSED", []],
      ["OTHER", ["own"]],
    ]);
  });

  it("lists a task on two boards once", () => {
    const columns = mergeBoardColumns([STANDARD("a", { NEW: [card("s")] }), STANDARD("b", { NEW: [card("s")] })], "me");
    expect(columns[0]!.cards.map((c) => c.boardId)).toEqual(["a"]);
  });

  it("offers ← into «انتهى» only to the board owner or the card's assignees", () => {
    const [, , , done] = mergeBoardColumns(
      [STANDARD("a", { DONE: [card("theirs"), card("mine", { assigneeIds: ["me"] })] })],
      "me",
    );
    expect(done!.cards.map((c) => [c.card.id, c.canMoveNext])).toEqual([
      ["theirs", false],
      ["mine", true],
    ]);
    const [, , , ownerDone] = mergeBoardColumns([{ ...STANDARD("a", { DONE: [card("t")] }), ownerId: "me" } as BoardDetail], "me");
    expect(ownerDone!.cards[0]!.canMoveNext).toBe(true);
  });

  it("offers no ← on a read-only board, nor from the last list", () => {
    const viewer = board("v", [{ id: "n", status: "NEW", cards: [card("c")] }, { id: "d", status: "DONE", cards: [] }], { role: "VIEWER" });
    const archived = board("z", [{ id: "n2", status: "NEW", cards: [card("c2")] }, { id: "d2", status: "DONE", cards: [] }], { isArchived: true });
    const last = STANDARD("l", { CLOSED: [card("end")] });
    const cards = mergeBoardColumns([viewer, archived, last], "me").flatMap((c) => c.cards);
    expect(cards.map((c) => [c.card.id, c.canMoveNext])).toEqual([
      ["c", false],
      ["c2", false],
      ["end", false],
    ]);
  });
});
