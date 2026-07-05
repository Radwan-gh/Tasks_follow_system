import { describe, expect, it } from "vitest";
import { generateKeyBetween, generateNKeysBetween, needsRebalance, OrderKeyError } from "./index";

describe("generateKeyBetween", () => {
  it("generates a first key when both bounds are null", () => {
    const key = generateKeyBetween(null, null);
    expect(key).toBe("a0");
  });

  it("generates a key before an existing key (insert at start)", () => {
    const first = generateKeyBetween(null, null);
    const before = generateKeyBetween(null, first);
    expect(before < first).toBe(true);
  });

  it("generates a key after an existing key (insert at end)", () => {
    const first = generateKeyBetween(null, null);
    const after = generateKeyBetween(first, null);
    expect(after > first).toBe(true);
  });

  it("generates a key strictly between two keys", () => {
    const a = generateKeyBetween(null, null);
    const c = generateKeyBetween(a, null);
    const b = generateKeyBetween(a, c);
    expect(b > a).toBe(true);
    expect(b < c).toBe(true);
  });

  it("keeps producing valid midpoints across many repeated insertions at the same boundary", () => {
    let lo: string | null = null;
    let hi = generateKeyBetween(null, null);
    const seen = new Set<string>([hi]);
    for (let i = 0; i < 200; i++) {
      const mid = generateKeyBetween(lo, hi);
      expect(mid < hi).toBe(true);
      if (lo !== null) expect(mid > lo).toBe(true);
      expect(seen.has(mid)).toBe(false);
      seen.add(mid);
      hi = mid;
    }
  });

  it("keeps producing valid midpoints when repeatedly inserting at the end", () => {
    let key = generateKeyBetween(null, null);
    const seen = new Set<string>([key]);
    for (let i = 0; i < 200; i++) {
      const next = generateKeyBetween(key, null);
      expect(next > key).toBe(true);
      expect(seen.has(next)).toBe(false);
      seen.add(next);
      key = next;
    }
  });

  it("rejects a >= b", () => {
    const a = generateKeyBetween(null, null);
    expect(() => generateKeyBetween(a, a)).toThrow(OrderKeyError);
    const before = generateKeyBetween(null, a);
    expect(() => generateKeyBetween(a, before)).toThrow(OrderKeyError);
  });

  it("simulates a full drag-and-drop reorder sequence and stays correctly sorted", () => {
    // Seed 5 items, then repeatedly move the last one to a random earlier slot.
    let keys = generateNKeysBetween(null, null, 5);
    for (let round = 0; round < 30; round++) {
      const moving = keys.pop()!;
      const targetIndex = Math.floor(Math.random() * keys.length);
      const before = targetIndex > 0 ? keys[targetIndex - 1] : null;
      const after = keys[targetIndex] ?? null;
      const newKey = generateKeyBetween(before, after);
      keys.splice(targetIndex, 0, newKey);
      void moving;
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("generateNKeysBetween", () => {
  it("generates N evenly ordered keys between null bounds", () => {
    const keys = generateNKeysBetween(null, null, 10);
    expect(keys).toHaveLength(10);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(new Set(keys).size).toBe(10);
  });

  it("returns an empty array for n=0 and a single key for n=1", () => {
    expect(generateNKeysBetween(null, null, 0)).toEqual([]);
    expect(generateNKeysBetween(null, null, 1)).toHaveLength(1);
  });
});

describe("needsRebalance", () => {
  it("flags keys past the length threshold", () => {
    expect(needsRebalance("a0")).toBe(false);
    expect(needsRebalance("a" + "1".repeat(60))).toBe(true);
  });
});
