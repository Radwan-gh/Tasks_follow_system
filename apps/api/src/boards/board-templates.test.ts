import { describe, expect, it } from "vitest";
import { generateNKeysBetween } from "@app/ordering";
import { TASK_WORKFLOW_TEMPLATE } from "./board-templates";

describe("TASK_WORKFLOW_TEMPLATE", () => {
  it("declares the five statuses in the expected order", () => {
    expect(TASK_WORKFLOW_TEMPLATE.map((l) => l.statusCategory)).toEqual([
      "NEW",
      "READY",
      "IN_PROGRESS",
      "REVIEW",
      "DONE",
    ]);
  });

  it("has exactly one terminal DONE status, as the last list", () => {
    const done = TASK_WORKFLOW_TEMPLATE.filter((l) => l.statusCategory === "DONE");
    expect(done).toHaveLength(1);
    expect(TASK_WORKFLOW_TEMPLATE.at(-1)?.statusCategory).toBe("DONE");
  });

  it("seeds positions that sort in template order and are unique", () => {
    // Mirrors BoardsService.create: one batch of keys for all template lists.
    const positions = generateNKeysBetween(null, null, TASK_WORKFLOW_TEMPLATE.length);

    expect(positions).toHaveLength(TASK_WORKFLOW_TEMPLATE.length);
    expect([...positions].sort()).toEqual(positions); // already ascending
    expect(new Set(positions).size).toBe(positions.length); // all unique
  });
});
