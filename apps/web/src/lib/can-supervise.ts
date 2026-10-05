import type { User } from "@app/types";

/**
 * Mirrors `canSupervise()` from `@app/types`. That package compiles to
 * CommonJS, which Rollup cannot name-import at runtime, so the web app only
 * ever imports *types* from it. Keep this rule identical to the shared one —
 * the server's `SupervisorGuard` is the real gate either way.
 */
export function canSupervise(user: Pick<User, "role" | "canViewAllBoards">): boolean {
  return user.role === "ADMIN" || user.canViewAllBoards;
}
