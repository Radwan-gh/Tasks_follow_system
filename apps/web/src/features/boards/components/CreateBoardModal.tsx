import { useState, type FormEvent } from "react";
import type { BoardTemplate, CreateBoardRequest } from "@app/types";

interface CreateBoardModalProps {
  onClose: () => void;
  onCreate: (input: CreateBoardRequest) => void;
  creating: boolean;
}

/** Name + description + optional due date + template — matches `CreateBoardRequestSchema` in full. */
export function CreateBoardModal({ onClose, onCreate, creating }: CreateBoardModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [template, setTemplate] = useState<BoardTemplate>("TASK_WORKFLOW");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      template,
    });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink/40" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-3 rounded-card bg-surface p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-ink">لوحة جديدة</h2>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">اسم اللوحة</span>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">الوصف (اختياري)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">موعد التسليم (اختياري)</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">القالب</span>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as BoardTemplate)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm text-ink"
          >
            <option value="TASK_WORKFLOW">قالب سير عمل المهام</option>
            <option value="EMPTY">لوحة فارغة</option>
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
            {creating ? "جارٍ الإنشاء..." : "إنشاء اللوحة"}
          </button>
        </div>
      </form>
    </div>
  );
}
