import { useState, type MouseEvent, type PointerEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardMember, Card } from "@app/types";
import { UserAvatar } from "./MemberPicker";

const MAX_FACE_AVATARS = 3;

interface CardItemProps {
  card: Card;
  boardMembers: BoardMember[];
  /** True when this card's list is `DONE`/`CLOSED` — suppresses the overdue-red due-date styling. */
  isListCompleted: boolean;
  /** Archived board or VIEWER role — server already rejects the mutation; this only hides the affordance. */
  readOnly: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export function CardItem({ card, boardMembers, isListCompleted, readOnly, onOpen, onDelete }: CardItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card" },
    disabled: readOnly,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
    setConfirmingDelete(false);
  }

  // The card root carries dnd-kit pointer listeners and an onClick that opens
  // the detail panel — any interactive sub-element (menu button, its items)
  // must not trigger either.
  const stop = {
    onPointerDown: (e: PointerEvent) => e.stopPropagation(),
    onClick: (e: MouseEvent) => e.stopPropagation(),
  };

  const isOverdue = Boolean(card.dueDate) && !isListCompleted && new Date(card.dueDate!) < new Date();
  const assignees = card.assigneeIds
    .map((id) => boardMembers.find((m) => m.userId === id))
    .filter((m): m is BoardMember => Boolean(m));
  const extraAssignees = assignees.length - MAX_FACE_AVATARS;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={`group relative overflow-hidden rounded-card border border-line bg-surface p-3.5 shadow-sm hover:shadow-md ${
        readOnly ? "cursor-pointer" : "cursor-grab pe-7"
      }`}
    >
      {card.priority === "URGENT" && (
        <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-urgent" />
      )}

      <div className="flex items-start gap-1.5 text-sm font-semibold leading-relaxed text-ink">
        {card.isRestricted && (
          <span title="مهمة مقيّدة الوصول" aria-hidden>
            🔒
          </span>
        )}
        <span>{card.title}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {card.dueDate && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                isOverdue ? "bg-alert-bg text-alert" : "bg-canvas text-muted"
              }`}
            >
              ◷{" "}
              {new Date(card.dueDate).toLocaleString("ar", {
                dateStyle: "medium",
                timeStyle: card.dueDateHasTime ? "short" : undefined,
              })}
            </span>
          )}
          {card.recurrence && (
            <span aria-hidden title="مهمة متكرّرة" className="shrink-0 text-xs text-muted">
              ↻
            </span>
          )}
        </div>

        {assignees.length > 0 && (
          <div className="flex shrink-0 items-center">
            {assignees.slice(0, MAX_FACE_AVATARS).map((m, i) => (
              <span key={m.userId} className={i > 0 ? "-ms-1.5" : ""}>
                <span className="block rounded-full ring-2 ring-surface">
                  <UserAvatar displayName={m.user.displayName} dimmed={!m.user.isActive} />
                </span>
              </span>
            ))}
            {extraAssignees > 0 && (
              <span className="-ms-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-line text-[10px] font-semibold text-ink/70 ring-2 ring-surface">
                +{extraAssignees}
              </span>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <button
          {...stop}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
            setConfirmingDelete(false);
          }}
          title="إجراءات البطاقة"
          className="absolute end-1 top-1 rounded px-1 text-muted opacity-0 hover:bg-canvas hover:text-ink focus:opacity-100 group-hover:opacity-100"
        >
          …
        </button>
      )}
      {!readOnly && menuOpen && (
        <>
          <div {...stop} className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
          <div
            {...stop}
            className="absolute end-1 top-6 z-20 w-36 rounded-field border border-line bg-surface py-1 text-sm shadow-lg"
          >
            <button
              {...stop}
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onOpen();
              }}
              className="block w-full px-3 py-1.5 text-start text-ink hover:bg-canvas"
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
                className="block w-full bg-alert px-3 py-1.5 text-start font-medium text-white hover:opacity-90"
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
                className="block w-full px-3 py-1.5 text-start text-alert hover:bg-alert-bg"
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
  return (
    <div className="w-64 rounded-card border border-line bg-surface p-3.5 text-sm font-semibold text-ink shadow-lg">
      {card.title}
    </div>
  );
}
