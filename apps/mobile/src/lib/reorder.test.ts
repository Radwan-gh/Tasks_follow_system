import { describe, expect, it } from "vitest";
import { groupSlotRange, planDrop, slotFromCenter, sortByPriority } from "./reorder";
import { neighbourIndexToward } from "./status-pager";

const card = (id: string, position: string, priority = "NORMAL") => ({ id, position, priority });

// Server order mixes the groups; the column shows U1, U2 first, then N1, N2, N3.
const N1 = card("N1", "a0");
const U1 = card("U1", "a1", "URGENT");
const N2 = card("N2", "a2");
const U2 = card("U2", "a3", "URGENT");
const N3 = card("N3", "a4");
const raw = [N1, U1, N2, U2, N3];

/** Applies a plan the way the server would: the new key sits strictly between the two neighbours. */
function displayAfter(list: typeof raw, dragged: (typeof raw)[number], slot: number): string[] {
  const plan = planDrop(list, dragged, slot);
  const others = list.filter((c) => c.id !== dragged.id);
  const result = [...others];
  result.splice(plan.rawIndex, 0, dragged);
  // The optimistic insert and the neighbours must agree.
  const at = result.indexOf(dragged);
  if (plan.move?.beforeId) expect(result.slice(0, at).map((c) => c.id)).toContain(plan.move.beforeId);
  if (plan.move?.afterId) expect(result.slice(at + 1).map((c) => c.id)).toContain(plan.move.afterId);
  return sortByPriority(result).map((c) => c.id);
}

describe("sortByPriority", () => {
  it("puts urgent cards first and keeps server order within each group", () => {
    expect(sortByPriority(raw).map((c) => c.id)).toEqual(["U1", "U2", "N1", "N2", "N3"]);
  });
});

describe("groupSlotRange", () => {
  it("keeps urgent cards in the top band and the rest below it", () => {
    const others = raw.filter((c) => c.id !== "N1");
    expect(groupSlotRange(others, true)).toEqual({ start: 0, end: 2 });
    expect(groupSlotRange(others, false)).toEqual({ start: 2, end: 4 });
  });
});

describe("slotFromCenter", () => {
  it("counts the midpoints the centre has passed", () => {
    expect(slotFromCenter([10, 30, 50], 0)).toBe(0);
    expect(slotFromCenter([10, 30, 50], 10)).toBe(0);
    expect(slotFromCenter([10, 30, 50], 31)).toBe(2);
    expect(slotFromCenter([10, 30, 50], 99)).toBe(3);
    expect(slotFromCenter([], 5)).toBe(0);
  });
});

describe("planDrop", () => {
  it("lands a normal card at every slot of its own group", () => {
    // Without N1 the column shows U1, U2, N2, N3 — normal slots are 2, 3 and 4.
    expect(displayAfter(raw, N1, 2)).toEqual(["U1", "U2", "N1", "N2", "N3"]);
    expect(displayAfter(raw, N1, 3)).toEqual(["U1", "U2", "N2", "N1", "N3"]);
    expect(displayAfter(raw, N1, 4)).toEqual(["U1", "U2", "N2", "N3", "N1"]);
  });

  it("clamps a normal card out of the urgent band", () => {
    expect(displayAfter(raw, N3, 0)).toEqual(["U1", "U2", "N3", "N1", "N2"]);
    expect(planDrop(raw, N3, 0).displayPosition).toBe(3);
  });

  it("clamps an urgent card into the urgent band", () => {
    expect(displayAfter(raw, U1, 4)).toEqual(["U2", "U1", "N1", "N2", "N3"]);
    expect(displayAfter(raw, U2, 0)).toEqual(["U2", "U1", "N1", "N2", "N3"]);
    expect(planDrop(raw, U1, 4).displayPosition).toBe(2);
  });

  it("anchors below the last card with no card after it", () => {
    const plan = planDrop(raw, N1, 4);
    expect(plan.move).toEqual({ beforeId: "N3", afterId: null });
    expect(plan.displayPosition).toBe(5);
  });

  it("places a card arriving from another list", () => {
    const incoming = card("X", "zz");
    expect(displayAfter([...raw, incoming].filter((c) => c.id !== "X"), incoming, 2)).toEqual(["U1", "U2", "X", "N1", "N2", "N3"]);
    expect(planDrop(raw, incoming, 2).unchanged).toBe(false);
  });

  it("handles a group with no cards yet", () => {
    const normals = [card("A", "a0"), card("B", "a1")];
    const urgent = card("U", "zz", "URGENT");
    expect(planDrop(normals, urgent, 5)).toMatchObject({ rawIndex: 0, move: { beforeId: null, afterId: "A" }, displayPosition: 1 });
    const urgents = [card("U1", "a0", "URGENT")];
    expect(planDrop(urgents, card("N", "zz"), 0)).toMatchObject({ rawIndex: 1, move: { beforeId: "U1", afterId: null }, displayPosition: 2 });
  });

  it("lets the server append into an empty list", () => {
    expect(planDrop([], card("X", "a0"), 0)).toEqual({ rawIndex: 0, move: undefined, displayPosition: 1, unchanged: false });
  });

  it("skips still-optimistic neighbours", () => {
    const list = [card("A", "a0"), card("temp:1", ""), card("B", "a1")];
    expect(planDrop(list, card("X", "zz"), 2).move).toEqual({ beforeId: "A", afterId: "B" });
  });

  it("detects a drop back into the same place", () => {
    expect(planDrop(raw, N2, 3).unchanged).toBe(true);
    expect(planDrop(raw, U2, 1).unchanged).toBe(true);
    expect(planDrop(raw, N2, 2).unchanged).toBe(false);
  });

  it("never sends a pair of neighbours that isn't strictly ascending", () => {
    const tied = [card("A", "a0"), card("B", "a0")];
    expect(planDrop(tied, card("X", "zz"), 1).move).toEqual({ beforeId: "A", afterId: null });
  });
});

describe("neighbourIndexToward", () => {
  it("pages towards the next status from the left edge in RTL", () => {
    const w = 400;
    const rtl = [4 * w, 3 * w, 2 * w, w, 0];
    expect(neighbourIndexToward(rtl, 0, "left")).toBe(1);
    expect(neighbourIndexToward(rtl, 0, "right")).toBeNull();
    expect(neighbourIndexToward(rtl, 2, "right")).toBe(1);
    expect(neighbourIndexToward(rtl, 4, "left")).toBeNull();
  });

  it("pages the other way in LTR", () => {
    const ltr = [0, 400, 800];
    expect(neighbourIndexToward(ltr, 0, "right")).toBe(1);
    expect(neighbourIndexToward(ltr, 1, "left")).toBe(0);
    expect(neighbourIndexToward([], 0, "left")).toBeNull();
  });
});
