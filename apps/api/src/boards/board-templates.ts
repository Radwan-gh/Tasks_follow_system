import type { ListStatusCategory } from "@app/types";

export interface BoardTemplateList {
  name: string;
  statusCategory: ListStatusCategory;
}

/**
 * Built-in "task workflow" template: the five status lists, in order. Seeded
 * when a board is created with `template: "TASK_WORKFLOW"`. Each list carries a
 * `statusCategory` so features like reports can identify the terminal statuses
 * regardless of the (renameable) Arabic name.
 *
 * The last two are both finished work but mean different things: `DONE`
 * ("تم التنفيذ") is the work being done, `CLOSED` ("انتهى") is it having been
 * delivered and confirmed. See `isCompleted` in `@app/types` for which
 * features collapse them and which must not.
 *
 * `REVIEW` ("بانتظار تقييم") was part of this template until `CLOSED` was
 * added. It is no longer seeded, but boards created earlier still have that
 * list and it stays a valid `ListStatusCategory`.
 */
export const TASK_WORKFLOW_TEMPLATE: BoardTemplateList[] = [
  { name: "جديد", statusCategory: "NEW" },
  { name: "جاهز للتنفيذ", statusCategory: "READY" },
  { name: "قيد التنفيذ", statusCategory: "IN_PROGRESS" },
  { name: "تم التنفيذ", statusCategory: "DONE" },
  { name: "انتهى", statusCategory: "CLOSED" },
];
