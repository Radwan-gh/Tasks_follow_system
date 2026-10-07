import type { BoardCategory, BoardSummary } from "@app/types";

/*
 * A hand-kept copy of `groupBoardsByCategory` / `canManageBoardCategory` from
 * `packages/types/src/board-categories.ts` (tested there via apps/mobile).
 * Web imports only *types* from `@app/types`: its CommonJS build re-exports
 * through `export *`, which Rollup can't resolve to named runtime exports —
 * the same reason `describeCardActivity` is mirrored in `CardDetailPanel.tsx`.
 * Change both together.
 */

export interface BoardSection<B> {
  /** null is «بلا تصنيف». */
  category: Pick<BoardCategory, "id" | "name"> | null;
  boards: B[];
}

export function groupBoardsByCategory<B extends Pick<BoardSummary, "category">>(
  boards: B[],
  categories: Pick<BoardCategory, "id" | "name" | "createdById">[],
  viewerId: string | undefined,
): BoardSection<B>[] {
  const byId = new Map<string, BoardSection<B>>();
  const uncategorised: B[] = [];

  for (const board of boards) {
    if (!board.category) {
      uncategorised.push(board);
      continue;
    }
    const section = byId.get(board.category.id) ?? { category: board.category, boards: [] };
    section.boards.push(board);
    byId.set(board.category.id, section);
  }
  for (const category of categories) {
    if (viewerId && category.createdById === viewerId && !byId.has(category.id)) {
      byId.set(category.id, { category: { id: category.id, name: category.name }, boards: [] });
    }
  }

  const named = [...byId.values()].sort((a, b) => a.category!.name.localeCompare(b.category!.name, "ar"));
  if (named.length === 0) return uncategorised.length > 0 ? [{ category: null, boards: uncategorised }] : [];
  return uncategorised.length > 0 ? [...named, { category: null, boards: uncategorised }] : named;
}

export function canManageBoardCategory(
  user: { id: string; role: string },
  category: Pick<BoardCategory, "createdById">,
): boolean {
  return user.role === "ADMIN" || category.createdById === user.id;
}
