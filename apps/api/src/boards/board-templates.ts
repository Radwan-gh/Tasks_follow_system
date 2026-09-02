import type { ListStatusCategory } from "@app/types";

export interface BoardTemplateList {
  name: string;
  statusCategory: ListStatusCategory;
}

/**
 * Built-in "task workflow" template: the five status lists, in order. Seeded
 * when a board is created with `template: "TASK_WORKFLOW"`. Each list carries a
 * `statusCategory` so features like reports can identify the terminal
 * `DONE`/`CLOSED` statuses regardless of the (renameable) Arabic name.
 *
 * `REVIEW` ("بانتظار تقييم") is retired from this template — new boards get
 * `CLOSED` ("انتهى") after `DONE` instead — but the enum value stays valid
 * forever for lists created before this change (see `ListStatusCategory` in
 * `packages/types`). Do not re-add `REVIEW` here.
 */
export const TASK_WORKFLOW_TEMPLATE: BoardTemplateList[] = [
  { name: "جديد", statusCategory: "NEW" },
  { name: "جاهز للتنفيذ", statusCategory: "READY" },
  { name: "قيد التنفيذ", statusCategory: "IN_PROGRESS" },
  { name: "تم التنفيذ", statusCategory: "DONE" },
  { name: "انتهى", statusCategory: "CLOSED" },
];
