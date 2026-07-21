import { useState } from "react";
import type { BoardMember, Card, UpdateCardAccessRequest, UpdateCardRequest } from "@app/types";

interface CardDetailModalProps {
  card: Card;
  boardMembers: BoardMember[];
  boardOwnerId: string;
  currentUserId: string;
  onClose: () => void;
  onSave: (updates: UpdateCardRequest) => Promise<void>;
  onSaveAccess: (updates: UpdateCardAccessRequest) => Promise<void>;
}

export function CardDetailModal({
  card,
  boardMembers,
  boardOwnerId,
  currentUserId,
  onClose,
  onSave,
  onSaveAccess,
}: CardDetailModalProps) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const canManageAccess = boardOwnerId === currentUserId || card.createdById === currentUserId;
  const [restricted, setRestricted] = useState(card.isRestricted);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set(card.memberIds));
  const [savingAccess, setSavingAccess] = useState(false);

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

  function toggleMember(userId: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSaveAccess() {
    setSavingAccess(true);
    try {
      await onSaveAccess({
        isRestricted: restricted,
        memberUserIds: restricted ? Array.from(memberIds) : [],
      });
    } finally {
      setSavingAccess(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-lg bg-white p-6 shadow-xl"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border-b border-slate-200 pb-1 text-lg font-semibold text-slate-900 focus:outline-none"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          rows={4}
          className="w-full rounded border border-slate-300 p-2 text-sm"
        />
        <div>
          <label className="block text-xs font-medium text-slate-500">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Access control */}
        {canManageAccess ? (
          <div className="mt-2 space-y-2 border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
              Restrict to specific people
            </label>
            {restricted && (
              <div className="space-y-1 rounded border border-slate-200 p-2">
                <p className="text-xs text-slate-500">
                  The board owner and you (the creator) always have access. Choose who else can see this task:
                </p>
                {boardMembers
                  .filter((m) => m.userId !== boardOwnerId && m.userId !== card.createdById)
                  .map((m) => (
                    <label key={m.userId} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={memberIds.has(m.userId)}
                        onChange={() => toggleMember(m.userId)}
                      />
                      {m.user.displayName} <span className="text-slate-400">{m.user.email}</span>
                    </label>
                  ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleSaveAccess}
                disabled={savingAccess}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {savingAccess ? "Updating..." : "Update access"}
              </button>
            </div>
          </div>
        ) : (
          card.isRestricted && (
            <div className="mt-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              🔒 This task is private to specific people.
            </div>
          )
        )}
      </div>
    </div>
  );
}
