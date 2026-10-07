import type { BoardCategory, BoardSummary } from "./domain";

type CategoryRef = Pick<BoardCategory, "id" | "name">;

export interface BoardSection<B> {
  /** null is «بلا تصنيف». */
  category: CategoryRef | null;
  boards: B[];
}

/**
 * The boards list's sections (`docs/17-board-categories.md`): one per category
 * holding at least one of `boards`, by name; then any *empty* category the
 * viewer created themselves — so a just-made «تصنيف جديد» shows up before it
 * has a board — and «بلا تصنيف» last. Other people's empty categories stay
 * out: they're only offered in the picker. Boards keep their incoming order
 * within a section.
 *
 * With no category in play at all the result is a single `null` section, so
 * the list renders flat with no header — exactly as before categories existed.
 */
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

/** Whether `user` may rename or delete `category`: its creator, or any ADMIN. */
export function canManageBoardCategory(
  user: { id: string; role: string },
  category: Pick<BoardCategory, "createdById">,
): boolean {
  return user.role === "ADMIN" || category.createdById === user.id;
}
