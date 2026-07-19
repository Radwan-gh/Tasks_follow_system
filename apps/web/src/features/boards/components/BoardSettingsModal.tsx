import { useState } from "react";
import type { BoardDetail, UpdateBoardRequest } from "@app/types";

interface BoardSettingsModalProps {
  board: BoardDetail;
  /** Archiving is OWNER-only server-side; hide the button for members. */
  canArchive: boolean;
  onClose: () => void;
  onSave: (updates: UpdateBoardRequest) => Promise<void>;
  onArchive: () => Promise<void>;
}

export function BoardSettingsModal({ board, canArchive, onClose, onSave, onArchive }: BoardSettingsModalProps) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("لا يمكن أن يكون اسم اللوحة فارغًا");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل حفظ اللوحة");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    setError(null);
    try {
      await onArchive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل حذف اللوحة");
      setSaving(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-lg bg-white p-6 shadow-xl"
      >
        <label className="block text-xs font-medium text-slate-500">اسم اللوحة</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900 focus:outline-none"
        />
        <label className="block text-xs font-medium text-slate-500">الوصف</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ما الغرض من هذه اللوحة؟"
          rows={4}
          className="w-full rounded border border-slate-300 p-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          <div>
            {canArchive &&
              (confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleArchive}
                    disabled={saving}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    تأكيد الحذف
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    disabled={saving}
                    className="rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    الاحتفاظ
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  disabled={saving}
                  className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  حذف اللوحة
                </button>
              ))}
          </div>
          <div className="flex gap-2">
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
        </div>
      </div>
    </div>
  );
}
