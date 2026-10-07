import type { User } from "@app/types";

/**
 * Mirrors `canApproveSharedBoards()` from `@app/types` — for the same reason
 * as `can-supervise.ts`: that package compiles to CommonJS, which Rollup
 * cannot name-import at runtime. Keep this rule identical to the shared one;
 * the server's `BoardsService.isApprover` is the real gate either way.
 */
export function canApproveSharedBoards(user: Pick<User, "role" | "canApproveBoards">): boolean {
  return user.role === "ADMIN" || user.canApproveBoards;
}
