import { useState, type MouseEvent, type PointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@app/types";

export function CardItem({ card, onOpen, onDelete }: { card: Card; onOpen: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card" },
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingDelete(false);
  }

  // The card root carries dnd-kit pointer listeners and an onClick that opens
  // the detail modal — the menu button must not trigger either.
  const stop = {
    onPointerDown: (e: PointerEvent) => e.stopPropagation(),
    onClick: (e: MouseEvent) => e.stopPropagation(),
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="group relative cursor-grab rounded bg-white p-2 pe-7 text-sm text-slate-800 shadow-sm hover:shadow"
    >
      {card.title}
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
        {card.dueDate && <span>{new Date(card.dueDate).toLocaleDateString()}</span>}
        {card.checklist && card.checklist.length > 0 && (
          <span
            className={
              card.checklist.every((i) => i.isCompleted)
                ? "rounded bg-green-100 px-1.5 py-0.5 text-green-700"
                : "rounded bg-slate-100 px-1.5 py-0.5 text-slate-500"
            }
            title="البنود الفرعية المنجزة"
          >
            ☑ {card.checklist.filter((i) => i.isCompleted).length}/{card.checklist.length}
          </span>
        )}
      </div>
      <button
        {...stop}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((open) => !open);
          setConfirmingDelete(false);
        }}
        title="إجراءات البطاقة"
        className="absolute end-1 top-1 rounded px-1 text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
      >
        …
      </button>
      {menuOpen && (
        <>
          <div {...stop} className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
          <div
            {...stop}
            className="absolute end-1 top-6 z-20 w-36 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            <button
              {...stop}
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onOpen();
              }}
              className="block w-full px-3 py-1.5 text-start text-slate-700 hover:bg-slate-100"
            >
              فتح
            </button>
            {confirmingDelete ? (
              <button
                {...stop}
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  onDelete();
                }}
                className="block w-full px-3 py-1.5 text-start font-medium text-white bg-red-600 hover:bg-red-500"
              >
                تأكيد الحذف
              </button>
            ) : (
              <button
                {...stop}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDelete(true);
                }}
                className="block w-full px-3 py-1.5 text-start text-red-600 hover:bg-red-50"
              >
                حذف
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function CardPreview({ card }: { card: Card }) {
  return <div className="w-56 rounded bg-white p-2 text-sm text-slate-800 shadow-lg">{card.title}</div>;
}
