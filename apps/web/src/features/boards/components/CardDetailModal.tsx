import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Card, CardActivity, ChecklistItem, UpdateCardRequest } from "@app/types";
import { api } from "../../../lib/api-client";

interface CardDetailModalProps {
  card: Card;
  onClose: () => void;
  onSave: (updates: UpdateCardRequest) => Promise<void>;
}

export function CardDetailModal({ card, onClose, onSave }: CardDetailModalProps) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["cardHistory", card.id],
    queryFn: () => api.cards.history(card.id),
  });

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        title,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900 focus:outline-none"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="الوصف"
          rows={4}
          className="w-full rounded border border-slate-300 p-2 text-sm"
        />
        <div>
          <label className="block text-xs font-medium text-slate-500">تاريخ الاستحقاق</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>

        <CardChecklist cardId={card.id} boardId={card.boardId} />

        <CardHistory activities={history} loading={historyLoading} />
      </div>
    </div>
  );
}

/** Interactive subtasks list for a card. Toggling an item also refreshes the
 *  board query so the tile's progress badge stays in sync. */
function CardChecklist({ cardId, boardId }: { cardId: string; boardId: string }) {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["cardChecklist", cardId],
    queryFn: () => api.cards.checklist(cardId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cardChecklist", cardId] });
    queryClient.invalidateQueries({ queryKey: ["board", boardId] });
  };

  const addItem = useMutation({
    mutationFn: (label: string) => api.cards.addChecklistItem(cardId, { label }),
    onSuccess: () => {
      setNewLabel("");
      refresh();
    },
  });
  const toggleItem = useMutation({
    mutationFn: (item: ChecklistItem) =>
      api.cards.updateChecklistItem(item.id, { isCompleted: !item.isCompleted }),
    onSuccess: refresh,
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.cards.removeChecklistItem(itemId),
    onSuccess: refresh,
  });

  const done = items?.filter((i) => i.isCompleted).length ?? 0;
  const total = items?.length ?? 0;

  return (
    <div className="border-t border-slate-200 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">البنود الفرعية</h3>
        {total > 0 && (
          <span className="text-xs text-slate-400">
            {done}/{total}
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">جارٍ التحميل...</p>
      ) : (
        <ul className="space-y-1">
          {(items ?? []).map((item) => (
            <li key={item.id} className="group flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.isCompleted}
                onChange={() => toggleItem.mutate(item)}
                className="h-4 w-4 shrink-0 rounded border-slate-300"
              />
              <span className={item.isCompleted ? "flex-1 text-slate-400 line-through" : "flex-1 text-slate-700"}>
                {item.label}
              </span>
              <button
                onClick={() => removeItem.mutate(item.id)}
                title="حذف البند"
                className="shrink-0 rounded px-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newLabel.trim()) return;
          addItem.mutate(newLabel.trim());
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="+ إضافة بند"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </form>
    </div>
  );
}

function CardHistory({ activities, loading }: { activities?: CardActivity[]; loading: boolean }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">السجل</h3>
      {loading ? (
        <p className="text-sm text-slate-400">جارٍ تحميل السجل...</p>
      ) : !activities || activities.length === 0 ? (
        <p className="text-sm text-slate-400">لا يوجد سجل بعد.</p>
      ) : (
        <ol className="space-y-2">
          {[...activities].reverse().map((activity) => (
            <li key={activity.id} className="flex gap-2 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
              <div>
                <span className="text-slate-700">
                  <span className="font-medium">{activity.actor.displayName}</span> {describeActivity(activity)}
                </span>
                <div className="text-xs text-slate-400">{formatTimestamp(activity.createdAt)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Arabic, human-readable description of a single history event. */
function describeActivity(activity: CardActivity): string {
  switch (activity.type) {
    case "CREATED":
      return activity.toValue ? `أنشأ البطاقة في «${activity.toValue}»` : "أنشأ البطاقة";
    case "MOVED":
      return `نقل البطاقة من «${activity.fromValue ?? "؟"}» إلى «${activity.toValue ?? "؟"}»`;
    case "RENAMED":
      return `غيّر العنوان من «${activity.fromValue ?? ""}» إلى «${activity.toValue ?? ""}»`;
    case "DESCRIPTION_UPDATED":
      return "حدّث الوصف";
    case "DUE_DATE_CHANGED":
      return activity.toValue
        ? `عيّن تاريخ الاستحقاق إلى ${formatDate(activity.toValue)}`
        : "أزال تاريخ الاستحقاق";
    case "ARCHIVED":
      return "أرشف البطاقة";
    case "UNARCHIVED":
      return "أعاد البطاقة من الأرشيف";
    case "CHECKLIST_ITEM_ADDED":
      return `أضاف البند «${activity.toValue ?? ""}»`;
    case "CHECKLIST_ITEM_COMPLETED":
      return `أنجز البند «${activity.toValue ?? ""}»`;
    case "CHECKLIST_ITEM_UNCOMPLETED":
      return `ألغى إنجاز البند «${activity.toValue ?? ""}»`;
    case "CHECKLIST_ITEM_REMOVED":
      return `حذف البند «${activity.fromValue ?? ""}»`;
    default:
      return "حدّث البطاقة";
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
}
