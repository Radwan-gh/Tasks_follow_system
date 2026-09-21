import type { BoardMember, List } from "@app/types";
import { statusDotClass } from "../lib/status-colors";
import { matchesFilters, type CardFilters } from "../lib/filter-cards";

/**
 * Search/filter replaces the horizontal drag-and-drop board with a plain
 * vertical list grouped by status — same approach `apps/mobile` takes,
 * since a partially-filtered view makes drag-reorder positions ambiguous.
 */
export function FilteredBoardView({
  lists,
  boardMembers,
  currentUserId,
  filters,
  onOpenCard,
}: {
  lists: List[];
  boardMembers: BoardMember[];
  currentUserId: string;
  filters: CardFilters;
  onOpenCard: (id: string) => void;
}) {
  const groups = lists
    .map((list) => ({ list, cards: list.cards.filter((c) => matchesFilters(c, filters, currentUserId)) }))
    .filter((g) => g.cards.length > 0);

  if (groups.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">لا نتائج مطابقة.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      {groups.map(({ list, cards }) => (
        <section key={list.id} className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(list.statusCategory)}`} />
            <span className="text-[13px] font-bold text-ink">{list.name}</span>
            <span className="text-xs text-muted">{cards.length}</span>
          </div>
          <ul className="space-y-2">
            {cards.map((card) => {
              const assignees = card.assigneeIds
                .map((id) => boardMembers.find((m) => m.userId === id)?.user.displayName)
                .filter(Boolean);
              return (
                <li key={card.id}>
                  <button
                    onClick={() => onOpenCard(card.id)}
                    className="relative block w-full overflow-hidden rounded-card border border-line bg-surface p-3.5 text-start shadow-sm hover:shadow-md"
                  >
                    {card.priority === "URGENT" && (
                      <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-urgent" />
                    )}
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {card.isRestricted && <span aria-hidden>🔒</span>}
                      <span>{card.title}</span>
                    </div>
                    {(card.dueDate || assignees.length > 0) && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                        {card.dueDate && <span>◷ {new Date(card.dueDate).toLocaleDateString("ar", { dateStyle: "medium" })}</span>}
                        {assignees.length > 0 && <span>{assignees.join("، ")}</span>}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
