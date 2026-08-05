import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { List, RecurringTask } from "@app/types";
import { api } from "../../../lib/api-client";

interface RecurringTasksModalProps {
  boardId: string;
  lists: List[];
  onClose: () => void;
}

/** Manage a board's recurring-task templates: create them with a fixed set of
 *  subtasks, activate/deactivate, delete, and generate the current week's card. */
export function RecurringTasksModal({ boardId, lists, onClose }: RecurringTasksModalProps) {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["recurringTasks", boardId],
    queryFn: () => api.recurringTasks.list(boardId),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recurringTasks", boardId] });
  const refreshBoard = () => queryClient.invalidateQueries({ queryKey: ["board", boardId] });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">المهام الدورية</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            إغلاق
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">جارٍ التحميل...</p>
        ) : (tasks ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد مهام دورية بعد. أنشئ واحدة أدناه.</p>
        ) : (
          <ul className="space-y-2">
            {(tasks ?? []).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                lists={lists}
                onChanged={refresh}
                onGenerated={refreshBoard}
              />
            ))}
          </ul>
        )}

        <CreateTaskForm boardId={boardId} lists={lists} onCreated={refresh} />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  lists,
  onChanged,
  onGenerated,
}: {
  task: RecurringTask;
  lists: List[];
  onChanged: () => void;
  onGenerated: () => void;
}) {
  const listName = lists.find((l) => l.id === task.targetListId)?.name ?? "؟";

  const toggleActive = useMutation({
    mutationFn: () => api.recurringTasks.update(task.id, { isActive: !task.isActive }),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => api.recurringTasks.remove(task.id),
    onSuccess: onChanged,
  });
  const generate = useMutation({
    mutationFn: () => api.recurringTasks.generate(task.id),
    onSuccess: onGenerated,
  });

  return (
    <li className="rounded border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{task.title}</span>
            {!task.isActive && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">متوقفة</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            أسبوعياً ← «{listName}» · {task.subtasks.length} بند
          </div>
          {task.subtasks.length > 0 && (
            <div className="mt-1 text-xs text-slate-400">
              {task.subtasks.map((s) => s.label).join("، ")}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {generate.isPending ? "..." : "إنشاء هذا الأسبوع"}
          </button>
          <div className="flex gap-2 text-xs">
            <button onClick={() => toggleActive.mutate()} className="text-slate-500 hover:underline">
              {task.isActive ? "إيقاف" : "تفعيل"}
            </button>
            <button onClick={() => remove.mutate()} className="text-red-500 hover:underline">
              حذف
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

function CreateTaskForm({
  boardId,
  lists,
  onCreated,
}: {
  boardId: string;
  lists: List[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [targetListId, setTargetListId] = useState(lists[0]?.id ?? "");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskDraft, setSubtaskDraft] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.recurringTasks.create(boardId, { title: title.trim(), targetListId, subtasks }),
    onSuccess: () => {
      setTitle("");
      setSubtasks([]);
      setSubtaskDraft("");
      onCreated();
    },
  });

  function addSubtask() {
    const label = subtaskDraft.trim();
    if (!label) return;
    setSubtasks((prev) => [...prev, label]);
    setSubtaskDraft("");
  }

  const canSubmit = title.trim() && targetListId && !create.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        create.mutate();
      }}
      className="space-y-2 border-t border-slate-200 pt-4"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">مهمة دورية جديدة</h3>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="اسم المهمة (مثال: تنظيف المعهد)"
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <label className="block text-xs text-slate-500">
        تظهر أسبوعياً في القائمة:
        <select
          value={targetListId}
          onChange={(e) => setTargetListId(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      {subtasks.length > 0 && (
        <ul className="space-y-1">
          {subtasks.map((label, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
              <span className="flex-1">• {label}</span>
              <button
                type="button"
                onClick={() => setSubtasks((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded px-1 text-slate-300 hover:text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={subtaskDraft}
          onChange={(e) => setSubtaskDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSubtask();
            }
          }}
          placeholder="+ بند فرعي (مثال: غسل الدرج)"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={addSubtask}
          className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          إضافة
        </button>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {create.isPending ? "جارٍ الإنشاء..." : "إنشاء المهمة الدورية"}
      </button>
    </form>
  );
}
