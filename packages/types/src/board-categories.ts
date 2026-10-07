import type { BoardCategory, BoardSummary } from "./domain";

type CategoryRef = Pick<BoardCategory, "id" | "name">;

export interface BoardSection<B> {
  /** null is «بلا تصنيف». */
  category: CategoryRef | null;
  boards: B[];
}

/**
 * The boards list's sections (`docs/17-board-categories.md`): one per category
 * holding at least one of `boards`, by name, and «بلا تصنيف» last. With
 * `includeEmpty` — for admins, who manage categories — every *empty* category
 * gets a section too, so a just-made «تصنيف جديد» shows up before it has a
 * board; everyone else only meets empty categories in the picker. Boards keep
 * their incoming order within a section.
 *
 * With no category in play at all the result is a single `null` section, so
 * the list renders flat with no header — exactly as before categories existed.
 */
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

  const named = [...byId.values()].sort((a, b) => a.category!.name.localeCompare(b.category!.name, "ar"));
  if (named.length === 0) return uncategorised.length > 0 ? [{ category: null, boards: uncategorised }] : [];
  return uncategorised.length > 0 ? [...named, { category: null, boards: uncategorised }] : named;
}

/**
 * Creating, renaming and deleting categories is for ADMINs only — they are
 * shared headings every user sees. Filing a board under an existing category
 * is a board edit instead (any board MEMBER, via `PATCH /boards/:id`).
 */
export function canManageBoardCategories(user: { role: string }): boolean {
  return user.role === "ADMIN";
}
