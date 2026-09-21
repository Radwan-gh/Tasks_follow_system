import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardMember, List } from "@app/types";
import { CardItem } from "./CardItem";
import { statusDotClass } from "../lib/status-colors";

interface ListColumnProps {
  list: List;
  boardMembers: BoardMember[];
  /** Archived board or VIEWER role — server already rejects the mutation; this only hides the affordance. */
  readOnly: boolean;
  /** Only meaningful for the `CLOSED` list — renders a "عرض الأقدم" row when set (i.e. still 30-day-filtered). */
  onShowOlderClosed?: () => void;
  onOpenCard: (id: string) => void;
  onDeleteCard: (id: string) => void;
}

/**
 * Lists have a fixed order and are created only from a board template
 * (`CreateBoardModal`) — reordering and ad-hoc list creation from the board
 * screen are intentionally not supported, so this column is not itself a
 * drag source. Cards still drag freely within and across lists via the
 * `${list.id}::empty` droppable below, which covers the whole card area.
 */
export function ListColumn({
  list,
  boardMembers,
  readOnly,
  onShowOlderClosed,
  onOpenCard,
  onDeleteCard,
}: ListColumnProps) {
  const { setNodeRef: setDropzoneRef } = useDroppable({
    id: `${list.id}::empty`,
    data: { type: "list-dropzone", listId: list.id },
  });
  const isListCompleted = list.statusCategory === "DONE" || list.statusCategory === "CLOSED";

  return (
    <div className="flex w-[260px] shrink-0 flex-col gap-2.5">
      <div className="flex items-center gap-1.5 px-1">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(list.statusCategory)}`} />
        <span className="text-[13px] font-bold text-ink">{list.name}</span>
        <span className="text-xs text-muted">{list.cards.length}</span>
      </div>

      <div ref={setDropzoneRef} className="flex min-h-[24px] flex-1 flex-col gap-2.5">
        <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {list.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              boardMembers={boardMembers}
              isListCompleted={isListCompleted}
              readOnly={readOnly}
              onOpen={() => onOpenCard(card.id)}
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}
        </SortableContext>
      </div>

      {list.statusCategory === "CLOSED" && onShowOlderClosed && (
        <button onClick={onShowOlderClosed} className="w-full py-1 text-center text-sm text-accent hover:underline">
          عرض الأقدم
        </button>
      )}
    </div>
  );
}
