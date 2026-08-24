import { describe, expect, it } from "vitest";
import { isCompleted } from "@app/types";
import { generateNKeysBetween } from "@app/ordering";
import { TASK_WORKFLOW_TEMPLATE } from "./board-templates";

describe("TASK_WORKFLOW_TEMPLATE", () => {
  it("declares the five statuses in the expected order", () => {
    expect(TASK_WORKFLOW_TEMPLATE.map((l) => l.statusCategory)).toEqual([
      "NEW",
      "READY",
      "IN_PROGRESS",
      "DONE",
      "CLOSED",
    ]);
  });

  it("ends with the two terminal statuses, DONE then CLOSED", () => {
    // A card reaches "انتهى" by way of "تم التنفيذ", so CLOSED must sit after
    // DONE — the board renders lists in this order and the quick-move arrow
    // walks it one step at a time.
    const terminal = TASK_WORKFLOW_TEMPLATE.filter((l) => isCompleted(l.statusCategory));
    expect(terminal.map((l) => l.statusCategory)).toEqual(["DONE", "CLOSED"]);
    expect(TASK_WORKFLOW_TEMPLATE.slice(-2).map((l) => l.statusCategory)).toEqual(["DONE", "CLOSED"]);
  });

  it("no longer seeds REVIEW, which is retired but still a valid category", () => {
    // Boards created before CLOSED existed still carry a "بانتظار تقييم" list,
    // so the enum keeps the value — new boards just do not get one.
    expect(TASK_WORKFLOW_TEMPLATE.some((l) => l.statusCategory === "REVIEW")).toBe(false);
  });

  it("seeds positions that sort in template order and are unique", () => {
    // Mirrors BoardsService.create: one batch of keys for all template lists.
    const positions = generateNKeysBetween(null, null, TASK_WORKFLOW_TEMPLATE.length);

    expect(positions).toHaveLength(TASK_WORKFLOW_TEMPLATE.length);
    expect([...positions].sort()).toEqual(positions); // already ascending
    expect(new Set(positions).size).toBe(positions.length); // all unique
  });
});
