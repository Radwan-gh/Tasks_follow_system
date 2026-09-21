import type { NotificationType } from "@app/types";

/**
 * Mirrors `packages/types/src/notification-content.ts`'s `describeNotification`
 * — kept as a local copy rather than importing the runtime value from
 * `@app/types`. That package is CommonJS-only (built for `apps/api`'s Node
 * runtime); a bundler-side import of any of its *runtime* exports pulls the
 * whole package into the client bundle (Rollup can't tree-shake a CJS
 * module's `require()`ed sub-modules), inflating the build by ~90KB for one
 * small function. `NotificationType` itself is a type-only import, erased at
 * compile time, so it carries no such cost. Keep this in sync by hand if the
 * shared wording changes.
 */
export function describeNotification(input: { type: NotificationType; payload?: Record<string, unknown> | null }): string {
  const title = typeof input.payload?.cardTitle === "string" ? input.payload.cardTitle : "مهمة";
  switch (input.type) {
    case "ASSIGNED":
      return `أُسندت إليك: ${title}`;
    case "DUE_SOON":
      return `موعد «${title}» يقترب`;
    case "OVERDUE":
      return `تأخّرت مهمة «${title}»`;
    case "COMMENT":
      return `تعليق جديد على «${title}»`;
    case "CARD_CLOSED":
      return `نُقلت «${title}» إلى «انتهى»`;
    default:
      return title;
  }
}
