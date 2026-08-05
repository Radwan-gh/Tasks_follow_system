import type { ListStatusCategory } from "@app/types";

export interface BoardTemplateList {
  name: string;
  statusCategory: ListStatusCategory;
}

/**
 * Built-in "task workflow" template: the five status lists, in order. Seeded
 * when a board is created with `template: "TASK_WORKFLOW"`. Each list carries a
 * `statusCategory` so features like reports can identify the terminal `DONE`
 * status regardless of the (renameable) Arabic name.
 */
export const TASK_WORKFLOW_TEMPLATE: BoardTemplateList[] = [
  { name: "جديد", statusCategory: "NEW" },
  { name: "جاهز للتنفيذ", statusCategory: "READY" },
  { name: "قيد التنفيذ", statusCategory: "IN_PROGRESS" },
  { name: "بانتظار تقييم", statusCategory: "REVIEW" },
  { name: "تم التنفيذ", statusCategory: "DONE" },
];
