import { useState, type FormEvent } from "react";
import type { List } from "@app/types";

interface CreateCardModalProps {
  lists: List[];
  defaultListId: string;
  onClose: () => void;
  onCreate: (listId: string, title: string) => void;
  creating: boolean;
}

/** Single top-level "+" entry point for new tickets — picks the target list explicitly since there's no per-list add field anymore. */
export function CreateCardModal({ lists, defaultListId, onClose, onCreate, creating }: CreateCardModalProps) {
  const [listId, setListId] = useState(defaultListId);
  const [title, setTitle] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(listId, title.trim());
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-card bg-surface p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-ink">مهمة جديدة</h2>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">العنوان</span>
          <input
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">الحالة</span>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm text-ink"
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-field px-3 py-1.5 text-sm text-ink/70 hover:bg-canvas">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={creating}
            className="rounded-field bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "جارٍ الإضافة..." : "إضافة المهمة"}
          </button>
        </div>
      </form>
    </div>
  );
}
