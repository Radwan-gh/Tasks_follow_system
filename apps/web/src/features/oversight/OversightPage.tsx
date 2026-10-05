import { useDeferredValue, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ListStatusCategory, OversightTask, OversightTasksQuery } from "@app/types";
import { api } from "../../lib/api-client";
import { BoardCard } from "../boards/components/BoardCard";

/**
 * «المتابعة» (oversight) — every board and every task, for an ADMIN or a user granted
 * `canViewAllBoards`. Read-only: opening a board or task lands on the normal
 * board page, which the server marks `supervised` and renders read-only.
 */
type Tab = "boards" | "tasks";

const TABS: { id: Tab; label: string }[] = [
  { id: "boards", label: "اللوحات" },
  { id: "tasks", label: "المهام" },
];

export function OversightPage() {
  const [tab, setTab] = useState<Tab>("boards");

  return (
    <div className="min-h-full bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">المتابعة</h1>
          <p className="text-xs text-muted">كل اللوحات والمهام في النظام، للقراءة فقط.</p>
        </div>
        <div role="tablist" className="flex rounded-field bg-canvas p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[36px] rounded-field px-4 text-sm ${
                tab === t.id ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "boards" ? <AllBoards /> : <AllTasks />}
    </div>
  );
}

// ── Boards ──────────────────────────────────────────────────────────────

function AllBoards() {
  const [archived, setArchived] = useState(false);
  const { data: boards, isLoading } = useQuery({
    queryKey: ["oversight", "boards", archived],
    queryFn: () => api.oversight.boards({ archived }),
  });

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">
          {boards ? `${boards.length} ${archived ? "لوحة مؤرشفة" : "لوحة نشطة"}` : ""}
        </span>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
          المؤرشفة
        </label>
      </div>

      {isLoading && <p className="text-muted">جارٍ تحميل اللوحات...</p>}
      {!isLoading && boards?.length === 0 && (
        <p className="text-muted">{archived ? "لا توجد لوحات مؤرشفة." : "لا توجد لوحات بعد."}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards?.map((board) => (
          <BoardCard key={board.id} board={board} isOwner={false} ownerName={board.owner.displayName} />
        ))}
      </div>
    </main>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ListStatusCategory; label: string }[] = [
  { value: "NEW", label: "جديد" },
  { value: "READY", label: "جاهز" },
  { value: "IN_PROGRESS", label: "قيد التنفيذ" },
  { value: "REVIEW", label: "مراجعة" },
  { value: "DONE", label: "منجز" },
  { value: "CLOSED", label: "انتهى" },
];

const STATUS_DOT: Record<ListStatusCategory, string> = {
  NEW: "bg-status-new",
  READY: "bg-status-ready",
  IN_PROGRESS: "bg-status-inProgress",
  REVIEW: "bg-status-inProgress",
  DONE: "bg-status-done",
  CLOSED: "bg-status-closed",
};

interface TaskFilters {
  q: string;
  assigneeId: string;
  boardId: string;
  statusCategory: ListStatusCategory | "";
  overdue: boolean;
  includeCompleted: boolean;
}

const EMPTY_FILTERS: TaskFilters = {
  q: "",
  assigneeId: "",
  boardId: "",
  statusCategory: "",
  overdue: false,
  includeCompleted: false,
};

function AllTasks() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS);
  // Typing in the search box shouldn't fire a request per keystroke.
  const q = useDeferredValue(filters.q.trim());

  const { data: users } = useQuery({ queryKey: ["oversight", "users"], queryFn: api.oversight.users });
  const { data: boards } = useQuery({
    queryKey: ["oversight", "boards", false],
    queryFn: () => api.oversight.boards({ archived: false }),
  });

  const query: OversightTasksQuery = {
    q: q || undefined,
    assigneeId: filters.assigneeId || undefined,
    boardId: filters.boardId || undefined,
    statusCategory: filters.statusCategory || undefined,
    overdue: filters.overdue ? "true" : undefined,
    includeCompleted: filters.includeCompleted ? "true" : undefined,
  };

  const tasks = useInfiniteQuery({
    queryKey: ["oversight", "tasks", query],
    queryFn: ({ pageParam }) => api.oversight.tasks({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = tasks.data?.pages.flatMap((p) => p.items) ?? [];
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  function set<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const selectClass =
    "min-h-[38px] rounded-field border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none";

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-line bg-surface p-3">
        <input
          type="search"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="⌕ بحث بعنوان المهمة"
          aria-label="بحث بعنوان المهمة"
          className="min-h-[38px] w-full rounded-field border border-line px-3 text-sm focus:border-accent focus:outline-none sm:w-[220px]"
        />
        <select aria-label="المسؤول" value={filters.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} className={selectClass}>
          <option value="">كل المسؤولين</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
              {u.isActive ? "" : " (معطّل)"}
            </option>
          ))}
        </select>
        <select aria-label="اللوحة" value={filters.boardId} onChange={(e) => set("boardId", e.target.value)} className={selectClass}>
          <option value="">كل اللوحات</option>
          {boards?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label="الحالة"
          value={filters.statusCategory}
          onChange={(e) => set("statusCategory", e.target.value as TaskFilters["statusCategory"])}
          className={selectClass}
        >
          <option value="">كل الحالات</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex min-h-[38px] items-center gap-2 px-1 text-sm text-ink/80">
          <input type="checkbox" checked={filters.overdue} onChange={(e) => set("overdue", e.target.checked)} />
          المتأخّرة فقط
        </label>
        <label className="flex min-h-[38px] items-center gap-2 px-1 text-sm text-ink/80">
          <input
            type="checkbox"
            checked={filters.includeCompleted}
            disabled={!!filters.statusCategory || filters.overdue}
            onChange={(e) => set("includeCompleted", e.target.checked)}
          />
          إظهار المكتملة
        </label>
        {filtersActive && (
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="ms-auto text-sm text-accent hover:underline">
            مسح التصفية
          </button>
        )}
      </div>

      {tasks.isLoading && <p className="text-muted">جارٍ تحميل المهام...</p>}
      {tasks.isError && <p className="text-alert">تعذّر تحميل المهام. أعد تحميل الصفحة للمحاولة مجددًا.</p>}
      {!tasks.isLoading && !tasks.isError && items.length === 0 && (
        <p className="text-muted">{filtersActive ? "لا مهام تطابق هذه التصفية." : "لا توجد مهام مفتوحة."}</p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-start text-xs text-muted">
                <th className="px-4 py-3 text-start font-semibold">المهمة</th>
                <th className="px-4 py-3 text-start font-semibold">اللوحة</th>
                <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                <th className="px-4 py-3 text-start font-semibold">المسؤولون</th>
                <th className="px-4 py-3 text-start font-semibold">الاستحقاق</th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={() => navigate(`/boards/${task.boardId}?card=${task.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tasks.hasNextPage && (
        <div className="flex justify-center">
          <button
            onClick={() => tasks.fetchNextPage()}
            disabled={tasks.isFetchingNextPage}
            className="min-h-[38px] rounded-field border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-canvas disabled:opacity-50"
          >
            {tasks.isFetchingNextPage ? "جارٍ التحميل..." : "عرض المزيد"}
          </button>
        </div>
      )}
    </main>
  );
}

function isOverdue(task: OversightTask): boolean {
  if (!task.dueDate) return false;
  if (task.statusCategory === "DONE" || task.statusCategory === "CLOSED") return false;
  return new Date(task.dueDate) < new Date();
}

function TaskRow({ task, onOpen }: { task: OversightTask; onOpen: () => void }) {
  const overdue = isOverdue(task);
  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      tabIndex={0}
      className="cursor-pointer border-b border-line last:border-b-0 hover:bg-canvas focus:bg-canvas focus:outline-none"
    >
      <td className="relative px-4 py-3">
        {task.priority === "URGENT" && <span aria-label="عاجلة" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-urgent" />}
        <div className="font-semibold text-ink">
          {task.isRestricted && (
            <span title="مهمة مقيّدة" className="me-1 text-muted">
              ⊘
            </span>
          )}
          {task.title}
        </div>
        <div className="mt-0.5 text-xs text-muted">
          أنشأها {task.createdBy.displayName}
          {task.subtaskTotal > 0 && ` · ${task.subtaskDone}/${task.subtaskTotal} مهام فرعية`}
        </div>
      </td>
      <td className="px-4 py-3 text-ink/80">{task.boardName}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-ink/80">
          <span aria-hidden className={`h-2 w-2 rounded-full ${task.statusCategory ? STATUS_DOT[task.statusCategory] : "bg-line"}`} />
          {task.listName}
        </span>
      </td>
      <td className="px-4 py-3 text-ink/80">
        {task.assignees.length > 0 ? task.assignees.map((a) => a.displayName).join("، ") : <span className="text-muted">—</span>}
      </td>
      <td className={`px-4 py-3 ${overdue ? "font-semibold text-alert" : "text-ink/80"}`}>
        {task.dueDate ? new Date(task.dueDate).toLocaleDateString("ar", { dateStyle: "medium" }) : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}
