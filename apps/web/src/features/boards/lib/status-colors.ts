import type { ListStatusCategory } from "@app/types";

/**
 * Tailwind color-token suffix for a list's status dot, per
 * `docs/app_design/v2-new-style.md` §2. `REVIEW` (retired from the current
 * seed template, still valid on older lists) and manually-created lists
 * (`null`) fall back to a neutral tone rather than inventing a new token.
 */
export function statusDotClass(category: ListStatusCategory | null): string {
  switch (category) {
    case "NEW":
      return "bg-status-new";
    case "READY":
      return "bg-status-ready";
    case "IN_PROGRESS":
      return "bg-status-inProgress";
    case "DONE":
      return "bg-status-done";
    case "CLOSED":
      return "bg-status-closed";
    default:
      return "bg-line";
  }
}
