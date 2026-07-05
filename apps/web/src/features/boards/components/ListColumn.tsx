import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { List } from "@app/types";
import { CardItem } from "./CardItem";

interface ListColumnProps {
  list: List;
  onAddCard: (title: string) => void;
  onOpenCard: (id: string) => void;
}

export function ListColumn({ list, onAddCard, onOpenCard }: ListColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: "list" },
  });
  const { setNodeRef: setDropzoneRef } = useDroppable({
    id: `${list.id}::empty`,
    data: { type: "list-dropzone", listId: list.id },
  });
  const [title, setTitle] = useState("");

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex w-64 shrink-0 flex-col rounded-lg bg-slate-200 p-2"
    >
      <div {...attributes} {...listeners} className="mb-2 cursor-grab px-2 py-1 text-sm font-semibold text-slate-700">
        {list.name}
      </div>
      <div ref={setDropzoneRef} className="flex min-h-[24px] flex-1 flex-col gap-2">
        <SortableContext items={list.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {list.cards.map((card) => (
            <CardItem key={card.id} card={card} onOpen={() => onOpenCard(card.id)} />
          ))}
        </SortableContext>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onAddCard(title.trim());
          setTitle("");
        }}
        className="mt-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="+ Add card"
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        />
      </form>
    </div>
  );
}
