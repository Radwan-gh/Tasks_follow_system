import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Attachment,
  BoardMember,
  Card,
  CardActivity,
  CardPriority,
  Comment,
  RecurrenceRule,
  Subtask,
  UpdateAssigneesRequest,
  UpdateCardAccessRequest,
  UpdateCardRequest,
} from "@app/types";
import { api, ApiError } from "../../../lib/api-client";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentUrl,
  formatFileSize,
  isPreviewableImage,
} from "../../../lib/attachment-url";
import { useCurrencySymbol } from "../../../lib/use-app-settings";
import { useDismissableLayer } from "../../../lib/use-dismissable-layer";
import { MemberChecklist } from "./MemberPicker";

interface CardDetailPanelProps {
  card: Card;
  boardMembers: BoardMember[];
  boardOwnerId: string;
  currentUserId: string;
  /** VIEWER role or archived board — server already rejects writes; this only hides the controls. */
  readOnly: boolean;
  onClose: () => void;
  onSave: (updates: UpdateCardRequest) => Promise<void>;
  onSaveAccess: (updates: UpdateCardAccessRequest) => Promise<void>;
  onSaveAssignees: (updates: UpdateAssigneesRequest) => Promise<void>;
}

const PRIORITY_LABEL: Record<CardPriority, string> = { LOW: "منخفضة", NORMAL: "عادية", URGENT: "عاجل" };
const WEEKDAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

type RecurrenceFreq = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

function freqOf(rule: RecurrenceRule | null): RecurrenceFreq {
  return rule?.freq ?? "NONE";
}

/**
 * A floating panel over the board, not a full-screen modal — the board stays
 * visible and interactive behind it (`docs/app_design`'s desktop frame).
 * Closes via the explicit button or an outside click, but outside-click is
 * suppressed while the main fields have unsaved edits so a stray click can't
 * silently discard typed text.
 */
export function CardDetailPanel({
  card,
  boardMembers,
  boardOwnerId,
  currentUserId,
  readOnly,
  onClose,
  onSave,
  onSaveAccess,
  onSaveAssignees,
}: CardDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const currencySymbol = useCurrencySymbol();

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : "");
  const [dueTime, setDueTime] = useState(card.dueDate && card.dueDateHasTime ? card.dueDate.slice(11, 16) : "");
  const [dueDateHasTime, setDueDateHasTime] = useState(card.dueDateHasTime);
  const [priority, setPriority] = useState<CardPriority>(card.priority);
  const [costAmount, setCostAmount] = useState(card.costAmount ?? "");
  const [costNote, setCostNote] = useState(card.costNote ?? "");
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>(freqOf(card.recurrence));
  const [weekdays, setWeekdays] = useState<number[]>(
    card.recurrence?.freq === "WEEKLY" ? card.recurrence.weekdays : [],
  );
  const [dayOfMonth, setDayOfMonth] = useState(card.recurrence?.freq === "MONTHLY" ? card.recurrence.dayOfMonth : 1);
  const [saving, setSaving] = useState(false);

  const canManageAccess = !readOnly && (boardOwnerId === currentUserId || card.createdById === currentUserId);
  const [restricted, setRestricted] = useState(card.isRestricted);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set(card.memberIds));
  const [savingAccess, setSavingAccess] = useState(false);

  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set(card.assigneeIds));
  const [savingAssignees, setSavingAssignees] = useState(false);

  const dirty =
    title !== card.title ||
    description !== (card.description ?? "") ||
    dueDate !== (card.dueDate ? card.dueDate.slice(0, 10) : "") ||
    dueDateHasTime !== card.dueDateHasTime ||
    priority !== card.priority ||
    costAmount !== (card.costAmount ?? "") ||
    costNote !== (card.costNote ?? "") ||
    recurrenceFreq !== freqOf(card.recurrence);

  useDismissableLayer(panelRef, !dirty, onClose);

  function buildRecurrence(): RecurrenceRule | null {
    if (recurrenceFreq === "NONE") return null;
    if (recurrenceFreq === "DAILY") return { freq: "DAILY" };
    if (recurrenceFreq === "WEEKLY") return { freq: "WEEKLY", weekdays: weekdays.length > 0 ? weekdays : [0] };
    return { freq: "MONTHLY", dayOfMonth };
  }

  async function handleSave() {
    setSaving(true);
    try {
      const combinedDueDate = dueDate
        ? new Date(dueDateHasTime && dueTime ? `${dueDate}T${dueTime}` : dueDate).toISOString()
        : null;
      await onSave({
        title,
        description: description || null,
        dueDate: combinedDueDate,
        dueDateHasTime: Boolean(dueDate) && dueDateHasTime,
        priority,
        costAmount: costAmount.trim() || null,
        costNote: costNote.trim() || null,
        recurrence: buildRecurrence(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function toggleMember(userId: string) {
    setMemberIds((prev) => toggled(prev, userId));
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
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

  async function handleSaveAssignees() {
    setSavingAssignees(true);
    try {
      await onSaveAssignees({ userIds: Array.from(assigneeIds) });
    } finally {
      setSavingAssignees(false);
    }
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-y-4 end-4 z-30 flex w-[404px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="text-sm font-bold text-ink">تفاصيل المهمة</span>
        <button onClick={onClose} className="rounded px-2 py-1 text-sm text-muted hover:bg-canvas">
          إغلاق
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={readOnly}
          className="w-full border-b border-line pb-1 text-lg font-bold text-ink focus:outline-none disabled:bg-transparent"
        />

        {/* Priority — 3-way toggle, only URGENT gets a face indicator elsewhere. */}
        <div className="flex items-center gap-1.5">
          {(Object.keys(PRIORITY_LABEL) as CardPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              disabled={readOnly}
              onClick={() => setPriority(p)}
              className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-70 ${
                priority === p
                  ? p === "URGENT"
                    ? "bg-urgent-bg text-urgent"
                    : "bg-accent-soft text-accent"
                  : "bg-canvas text-muted"
              }`}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="الوصف"
          rows={3}
          disabled={readOnly}
          className="w-full rounded-field border border-line p-2 text-sm disabled:bg-canvas"
        />

        {/* Due date + optional time-of-day, with a secondary Hijri line landing in Phase 9. */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">تاريخ الاستحقاق</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={readOnly}
              className="rounded-field border border-line px-2 py-1 text-sm"
            />
            {dueDate && (
              <label className="flex items-center gap-1.5 text-xs text-ink/70">
                <input
                  type="checkbox"
                  checked={dueDateHasTime}
                  disabled={readOnly}
                  onChange={(e) => setDueDateHasTime(e.target.checked)}
                />
                تحديد وقت
              </label>
            )}
            {dueDate && dueDateHasTime && (
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={readOnly}
                className="rounded-field border border-line px-2 py-1 text-sm"
              />
            )}
          </div>
        </div>

        {/* Cost — details-panel only, never shown on the card face. */}
        <div className="space-y-1.5 rounded-field bg-canvas p-3">
          <span className="text-xs font-semibold text-ink/70">التكلفة</span>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={costAmount}
              onChange={(e) => setCostAmount(e.target.value)}
              placeholder="0.00"
              disabled={readOnly}
              className="w-24 rounded-field border border-line bg-surface px-2 py-1 text-sm"
            />
            <span className="text-xs text-muted">{currencySymbol}</span>
            <input
              value={costNote}
              onChange={(e) => setCostNote(e.target.value)}
              placeholder="ملاحظة (اختياري) — مثل رقم الفاتورة"
              disabled={readOnly}
              className="flex-1 rounded-field border border-line bg-surface px-2 py-1 text-sm"
            />
          </div>
        </div>

        {/* Attachments */}
        <AttachmentsSection
          cardId={card.id}
          currentUserId={currentUserId}
          canManageCard={canManageAccess}
          readOnly={readOnly}
        />

        {/* Recurrence */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted">التكرار</span>
          <select
            value={recurrenceFreq}
            onChange={(e) => setRecurrenceFreq(e.target.value as RecurrenceFreq)}
            disabled={readOnly}
            className="w-full rounded-field border border-line px-2 py-1 text-sm text-ink"
          >
            <option value="NONE">بدون تكرار</option>
            <option value="DAILY">يوميًا</option>
            <option value="WEEKLY">أسبوعيًا</option>
            <option value="MONTHLY">شهريًا</option>
          </select>
          {recurrenceFreq === "WEEKLY" && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleWeekday(day)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-70 ${
                    weekdays.includes(day) ? "bg-accent text-white" : "bg-canvas text-ink/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {recurrenceFreq === "MONTHLY" && (
            <label className="flex items-center gap-2 text-xs text-ink/70">
              يوم
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                disabled={readOnly}
                className="w-16 rounded-field border border-line px-2 py-1 text-sm"
              />
              من كل شهر
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button onClick={onClose} className="rounded-field px-3 py-1.5 text-sm text-ink/70 hover:bg-canvas">
            {readOnly ? "إغلاق" : "إلغاء"}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-field bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </button>
          )}
        </div>

        {/* Assignees — anyone with access to the card may assign it to board members */}
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold text-ink">المسؤولون عن المهمة</p>
          {readOnly ? (
            <p className="text-sm text-ink/70">
              {boardMembers
                .filter((m) => assigneeIds.has(m.userId))
                .map((m) => m.user.displayName)
                .join("، ") || "لا يوجد مسؤولون."}
            </p>
          ) : (
            <>
              <MemberChecklist
                members={boardMembers}
                selected={assigneeIds}
                onToggle={(id) => setAssigneeIds((prev) => toggled(prev, id))}
                onClear={() => setAssigneeIds(new Set())}
                emptyHint="لا يوجد أعضاء في اللوحة لإسنادها إليهم."
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveAssignees}
                  disabled={savingAssignees}
                  className="rounded-field border border-line px-3 py-1 text-xs text-ink/70 hover:bg-canvas disabled:opacity-50"
                >
                  {savingAssignees ? "جارٍ الحفظ..." : "حفظ المسؤولين"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Subtasks */}
        <SubtasksSection card={card} boardMembers={boardMembers} readOnly={readOnly} />

        {/* Access control */}
        {canManageAccess ? (
          <div className="space-y-2 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
              تقييد الوصول لأشخاص محددين
            </label>
            {restricted && (
              <div className="space-y-1">
                <p className="text-xs text-muted">
                  مالك اللوحة وأنت (المُنشئ) تملكان الوصول دائمًا. اختر من يمكنه أيضًا رؤية هذه المهمة:
                </p>
                <MemberChecklist
                  members={boardMembers.filter(
                    (m) => m.userId !== boardOwnerId && m.userId !== card.createdById,
                  )}
                  selected={memberIds}
                  onToggle={toggleMember}
                  onClear={() => setMemberIds(new Set())}
                  emptyHint="لا يوجد أعضاء آخرون في اللوحة."
                />
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleSaveAccess}
                disabled={savingAccess}
                className="rounded-field border border-line px-3 py-1 text-xs text-ink/70 hover:bg-canvas disabled:opacity-50"
              >
                {savingAccess ? "جارٍ التحديث..." : "تحديث الوصول"}
              </button>
            </div>
          </div>
        ) : (
          card.isRestricted && (
            <div className="border-t border-line pt-3 text-xs text-muted">🔒 هذه المهمة خاصة بأشخاص محددين.</div>
          )
        )}

        <HistoryAndComments cardId={card.id} currentUserId={currentUserId} readOnly={readOnly} />
      </div>
    </div>
  );
}

function SubtasksSection({
  card,
  boardMembers,
  readOnly,
}: {
  card: Card;
  boardMembers: BoardMember[];
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const { data: subtasks, isLoading } = useQuery({
    queryKey: ["subtasks", card.id],
    queryFn: () => api.subtasks.list(card.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["subtasks", card.id] });
  const doneCount = subtasks?.filter((s) => s.isDone).length ?? 0;

  async function addSubtask() {
    const title = newTitle.trim();
    if (!title) return;
    await api.subtasks.create(card.id, { title });
    setNewTitle("");
    refresh();
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">المهام الفرعية</p>
        {subtasks && subtasks.length > 0 && (
          <span className="text-xs text-muted">
            {doneCount}/{subtasks.length}
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="text-xs text-muted">جارٍ التحميل...</p>
      ) : (
        <ul className="space-y-1">
          {subtasks?.map((subtask) => (
            <SubtaskRow
              key={subtask.id}
              subtask={subtask}
              boardMembers={boardMembers}
              readOnly={readOnly}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
      {!readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addSubtask();
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="+ إضافة مهمة فرعية"
            className="w-full rounded-field border border-line px-2 py-1 text-sm"
          />
        </form>
      )}
    </div>
  );
}

function SubtaskRow({
  subtask,
  boardMembers,
  readOnly,
  onChanged,
}: {
  subtask: Subtask;
  boardMembers: BoardMember[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set(subtask.assigneeIds));
  const [saving, setSaving] = useState(false);

  async function toggleDone() {
    await api.subtasks.update(subtask.id, { isDone: !subtask.isDone });
    onChanged();
  }

  async function remove() {
    await api.subtasks.remove(subtask.id);
    onChanged();
  }

  async function saveAssignees() {
    setSaving(true);
    try {
      await api.subtasks.updateAssignees(subtask.id, { userIds: Array.from(assigneeIds) });
      setShowAssign(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-field border border-line px-2 py-1">
      <div className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={subtask.isDone} disabled={readOnly} onChange={toggleDone} />
        <span className={subtask.isDone ? "text-muted line-through" : "text-ink"}>{subtask.title}</span>
        {!readOnly && (
          <>
            <button
              onClick={() => setShowAssign((v) => !v)}
              className="ms-auto rounded px-1 text-xs text-muted hover:bg-canvas"
              title="المسؤولون"
            >
              👤 {subtask.assigneeIds.length > 0 ? subtask.assigneeIds.length : ""}
            </button>
            <button onClick={remove} className="rounded px-1 text-xs text-alert hover:bg-alert-bg" title="حذف">
              ✕
            </button>
          </>
        )}
        {readOnly && subtask.assigneeIds.length > 0 && (
          <span className="ms-auto text-xs text-muted">👤 {subtask.assigneeIds.length}</span>
        )}
      </div>
      {!readOnly && showAssign && (
        <div className="mt-1 space-y-1">
          <MemberChecklist
            members={boardMembers}
            selected={assigneeIds}
            onToggle={(id) => setAssigneeIds((prev) => toggled(prev, id))}
            onClear={() => setAssigneeIds(new Set())}
            emptyHint="لا يوجد أعضاء لإسنادها إليهم."
          />
          <div className="flex justify-end">
            <button
              onClick={saveAssignees}
              disabled={saving}
              className="rounded-field border border-line px-2 py-0.5 text-xs text-ink/70 hover:bg-canvas disabled:opacity-50"
            >
              {saving ? "..." : "حفظ"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Immutable toggle of a value in a Set (returns a new Set). */
function toggled(prev: Set<string>, value: string): Set<string> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

type TimelineEntry = { kind: "activity"; createdAt: string; activity: CardActivity } | { kind: "comment"; createdAt: string; comment: Comment };

/**
 * `GET /cards/:id/history` and `GET /cards/:id/comments` are two separate
 * endpoints with different shapes — merged into one timeline client-side by
 * timestamp, per `CommentSchema`'s own doc comment (a forced server-side
 * union would be more complex than this light merge).
 */
function HistoryAndComments({
  cardId,
  currentUserId,
  readOnly,
}: {
  cardId: string;
  currentUserId: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: activities, isLoading: historyLoading } = useQuery({
    queryKey: ["cardHistory", cardId],
    queryFn: () => api.cards.history(cardId),
  });
  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ["comments", cardId],
    queryFn: () => api.comments.list(cardId),
  });

  const loading = historyLoading || commentsLoading;
  const entries: TimelineEntry[] = [
    ...(activities ?? []).map((activity): TimelineEntry => ({ kind: "activity", createdAt: activity.createdAt, activity })),
    ...(comments ?? []).map((comment): TimelineEntry => ({ kind: "comment", createdAt: comment.createdAt, comment })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await api.comments.create(cardId, { body: trimmed });
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["comments", cardId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال التعليق");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(commentId: string) {
    await api.comments.remove(cardId, commentId);
    queryClient.invalidateQueries({ queryKey: ["comments", cardId] });
  }

  return (
    <div className="border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">السجل والتعليقات</h3>
      {loading ? (
        <p className="text-sm text-muted">جارٍ التحميل...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">لا يوجد سجل بعد.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) =>
            entry.kind === "activity" ? (
              <li key={`a-${entry.activity.id}`} className="flex gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" aria-hidden />
                <div>
                  <span className="text-ink/80">
                    <span className="font-medium text-ink">{entry.activity.actor.displayName}</span>{" "}
                    {describeActivity(entry.activity)}
                  </span>
                  <div className="text-xs text-muted">{formatTimestamp(entry.activity.createdAt)}</div>
                </div>
              </li>
            ) : (
              <li key={`c-${entry.comment.id}`} className="rounded-field bg-canvas p-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">{entry.comment.author.displayName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{formatTimestamp(entry.comment.createdAt)}</span>
                    {!readOnly && entry.comment.author.id === currentUserId && (
                      <button onClick={() => removeComment(entry.comment.id)} className="text-xs text-alert hover:underline">
                        حذف
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-ink/80">{entry.comment.body}</p>
              </li>
            ),
          )}
        </ol>
      )}

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="اكتب تعليقًا…"
            className="flex-1 rounded-field border border-line px-2.5 py-1.5 text-sm"
          />
          <button
            onClick={send}
            disabled={sending || !body.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-accent text-white disabled:opacity-50"
          >
            ↑
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}

function AttachmentsSection({
  cardId,
  currentUserId,
  canManageCard,
  readOnly,
}: {
  cardId: string;
  currentUserId: string;
  canManageCard: boolean;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: attachments } = useQuery({
    queryKey: ["attachments", cardId],
    queryFn: () => api.attachments.list(cardId),
  });

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`حجم الملف يتجاوز ${formatFileSize(MAX_ATTACHMENT_BYTES)}`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await api.attachments.upload(cardId, file);
      queryClient.invalidateQueries({ queryKey: ["attachments", cardId] });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 413
          ? `حجم الملف يتجاوز ${formatFileSize(MAX_ATTACHMENT_BYTES)}`
          : err instanceof ApiError
            ? err.message
            : "تعذّر رفع الملف",
      );
    } finally {
      setUploading(false);
    }
  }

  async function remove(attachmentId: string) {
    await api.attachments.remove(cardId, attachmentId);
    queryClient.invalidateQueries({ queryKey: ["attachments", cardId] });
  }

  const canDelete = (attachment: Attachment) =>
    !readOnly && (attachment.uploader.id === currentUserId || canManageCard);
  const images = attachments?.filter((a) => isPreviewableImage(a.mimeType)) ?? [];
  const files = attachments?.filter((a) => !isPreviewableImage(a.mimeType)) ?? [];

  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-ink">المرفقات</span>

      {/* Any file type may be attached — images show as thumbnails, everything else as a named row. */}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((attachment) => (
            <li
              key={attachment.id}
              className="group flex items-center gap-2 rounded-field border border-line bg-canvas px-2.5 py-1.5"
            >
              <span aria-hidden>📄</span>
              <a
                href={attachmentUrl(attachment.url)}
                target="_blank"
                rel="noreferrer"
                download={attachment.fileName}
                className="min-w-0 flex-1 truncate text-sm text-ink hover:underline"
                title={attachment.fileName}
              >
                {attachment.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted">{formatFileSize(attachment.sizeBytes)}</span>
              {canDelete(attachment) && (
                <button
                  onClick={() => remove(attachment.id)}
                  className="shrink-0 rounded px-1 text-xs text-alert hover:bg-alert-bg"
                  title="حذف"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {images.map((attachment) => (
          <div key={attachment.id} className="group relative aspect-square overflow-hidden rounded-field bg-canvas">
            <a href={attachmentUrl(attachment.url)} target="_blank" rel="noreferrer" title={attachment.fileName}>
              <img src={attachmentUrl(attachment.url)} alt={attachment.fileName} className="h-full w-full object-cover" />
            </a>
            {canDelete(attachment) && (
              <button
                onClick={() => remove(attachment.id)}
                className="absolute end-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/60 text-[10px] text-white opacity-0 group-hover:opacity-100"
                title="حذف"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="إرفاق ملف"
            className="flex aspect-square items-center justify-center rounded-field border border-dashed border-line text-lg text-muted hover:bg-canvas disabled:opacity-50"
          >
            {uploading ? "…" : "+"}
          </button>
        )}
        {!readOnly && <input ref={fileInputRef} type="file" onChange={onFileChange} className="hidden" />}
      </div>
      {error && <p className="text-xs text-alert">{error}</p>}
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
    case "ASSIGNED":
      return activity.toValue ? `أسند المهمة إلى ${activity.toValue}` : "أسند المهمة";
    case "UNASSIGNED":
      return "أزال إسناد المهمة";
    case "COST_UPDATED":
      return activity.toValue ? `حدّث التكلفة إلى ${activity.toValue}` : "أزال التكلفة";
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
