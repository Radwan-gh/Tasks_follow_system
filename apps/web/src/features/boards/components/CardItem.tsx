import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@app/types";

export function CardItem({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card" },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="cursor-grab rounded bg-white p-2 text-sm text-slate-800 shadow-sm hover:shadow"
    >
      <div className="flex items-start gap-1">
        {card.isRestricted && <span title="Private task">🔒</span>}
        <span>{card.title}</span>
      </div>
      {card.dueDate && (
        <div className="mt-1 text-xs text-slate-400">{new Date(card.dueDate).toLocaleDateString()}</div>
      )}
    </div>
  );
}

export function CardPreview({ card }: { card: Card }) {
  return <div className="w-56 rounded bg-white p-2 text-sm text-slate-800 shadow-lg">{card.title}</div>;
}
