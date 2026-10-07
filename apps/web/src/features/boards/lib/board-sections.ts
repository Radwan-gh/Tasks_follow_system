import type { BoardCategory, BoardSummary } from "@app/types";

/*
 * A hand-kept copy of `groupBoardsByCategory` / `canManageBoardCategories` / `categoryMoveFor` from
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
  categories: Pick<BoardCategory, "id" | "name">[],
  { includeEmpty }: { includeEmpty: boolean },
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
  if (includeEmpty) {
    for (const category of categories) {
      if (!byId.has(category.id)) byId.set(category.id, { category: { id: category.id, name: category.name }, boards: [] });
    }
  }

  // `categories` arrives in the admin-set order; a category it doesn't list yet
  // (stale cache) goes last.
  const rank = new Map(categories.map((c, i) => [c.id, i]));
  const named = [...byId.values()].sort(
    (a, b) =>
      (rank.get(a.category!.id) ?? Infinity) - (rank.get(b.category!.id) ?? Infinity) ||
      a.category!.name.localeCompare(b.category!.name, "ar"),
  );
  if (named.length === 0) return uncategorised.length > 0 ? [{ category: null, boards: uncategorised }] : [];
  return uncategorised.length > 0 ? [...named, { category: null, boards: uncategorised }] : named;
}

export function canManageBoardCategories(user: { role: string }): boolean {
  return user.role === "ADMIN";
}

/**
 * The `move` body that shifts category `id` one place up or down within
 * `orderedIds` (the current order), or null at either end. Neighbour ids, not
 * positions — the server re-reads their keys itself (`MoveTargetSchema`).
 */
export function categoryMoveFor(
  orderedIds: string[],
  id: string,
  direction: "up" | "down",
): { beforeId: string | null; afterId: string | null } | null {
  const i = orderedIds.indexOf(id);
  if (i < 0) return null;
  if (direction === "up") {
    if (i === 0) return null;
    return { beforeId: orderedIds[i - 2] ?? null, afterId: orderedIds[i - 1]! };
  }
  if (i === orderedIds.length - 1) return null;
  return { beforeId: orderedIds[i + 1]!, afterId: orderedIds[i + 2] ?? null };
}
