import { useState } from "react";
import type { BoardDetail, UpdateBoardRequest } from "@app/types";

interface BoardSettingsModalProps {
  board: BoardDetail;
  /** Archiving and deleting are OWNER-only server-side; hide the button for members. */
  canArchive: boolean;
  onClose: () => void;
  onSave: (updates: UpdateBoardRequest) => Promise<void>;
  onArchive: () => Promise<void>;
  /** Only offered once the board is archived — the server rejects deleting a live board. */
  onDelete: () => Promise<void>;
  /** Members and viewers leave the board (the owner can't); takes the place of archive/delete for them. */
  onLeave: () => Promise<void>;
}

export function BoardSettingsModal({ board, canArchive, onClose, onSave, onArchive, onDelete, onLeave }: BoardSettingsModalProps) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? "");
  const [dueDate, setDueDate] = useState(board.dueDate ? board.dueDate.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("لا يمكن أن يكون اسم اللوحة فارغًا");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل حفظ اللوحة");
    } finally {
      setSaving(false);
    }
  }

  // The owner archives a live board, then may delete it once archived; anyone
  // else can only take themselves off it.
  const action = !canArchive ? "leave" : board.isArchived ? "delete" : "archive";
  const copy = {
    archive: {
      button: "أرشفة اللوحة",
      confirm: "تأكيد الأرشفة",
      consequence: "تصبح اللوحة للقراءة فقط، ويمكن استعادتها أو حذفها لاحقًا.",
      failed: "فشلت أرشفة اللوحة",
    },
    delete: {
      button: "حذف اللوحة",
      confirm: "حذف نهائيًا",
      consequence: "تُحذف اللوحة بكل قوائمها ومهامها ومرفقاتها وسجلّها، ولا يمكن التراجع عن ذلك.",
      failed: "فشل حذف اللوحة",
    },
    leave: {
      button: "مغادرة اللوحة",
      confirm: "تأكيد المغادرة",
      consequence: "تختفي اللوحة من قائمتك، ولا تعود إليها إلا إن أضافك مالكها من جديد.",
      failed: "فشلت مغادرة اللوحة",
    },
  }[action];

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await (action === "delete" ? onDelete() : action === "archive" ? onArchive() : onLeave());
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
      setSaving(false);
      setConfirming(false);
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
        <label className="block text-xs font-medium text-slate-500">موعد التسليم (اختياري)</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
        {confirming && <p className="text-sm text-slate-600">{copy.consequence}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          <div>
            {confirming ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {copy.confirm}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={saving}
                  className="rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                >
                  الاحتفاظ
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={saving}
                className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                {copy.button}
              </button>
            )}
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
