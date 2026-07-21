import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BoardMember, Card, CardActivity, UpdateCardAccessRequest, UpdateCardRequest } from "@app/types";
import { api } from "../../../lib/api-client";

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

        {/* Access control */}
        {canManageAccess ? (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
              تقييد الوصول لأشخاص محددين
            </label>
            {restricted && (
              <div className="space-y-1 rounded border border-slate-200 p-2">
                <p className="text-xs text-slate-500">
                  مالك اللوحة وأنت (المُنشئ) تملكان الوصول دائمًا. اختر من يمكنه أيضًا رؤية هذه المهمة:
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
                {savingAccess ? "جارٍ التحديث..." : "تحديث الوصول"}
              </button>
            </div>
          </div>
        ) : (
          card.isRestricted && (
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              🔒 هذه المهمة خاصة بأشخاص محددين.
            </div>
          )
        )}

        <CardHistory activities={history} loading={historyLoading} />
      </div>
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
