import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ReportTask } from "@app/types";
import { api } from "../../lib/api-client";

type Tab = "overview" | "completed" | "overdue" | "workload" | "recurring";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "نظرة عامة على اللوحات" },
  { id: "completed", label: "المُنجَز آخر أسبوع" },
  { id: "overdue", label: "المهام المتأخّرة" },
  { id: "workload", label: "عبء العمل حسب الشخص" },
  { id: "recurring", label: "المهام الدورية" },
];

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">التقارير</h1>
        <Link to="/boards" className="text-sm text-slate-500 underline">
          → اللوحات
        </Link>
      </header>

      <main className="mx-auto max-w-4xl p-6">
        <nav className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-3 py-1.5 text-sm ${
                tab === t.id
                  ? "bg-slate-900 font-medium text-white"
                  : "border border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "overview" && <OverviewReport />}
        {tab === "completed" && <CompletedReport />}
        {tab === "overdue" && <OverdueReport />}
        {tab === "workload" && <WorkloadReport />}
        {tab === "recurring" && <RecurringReport />}
      </main>
    </div>
  );
}

function ReportState({ loading, empty, emptyText }: { loading: boolean; empty: boolean; emptyText: string }) {
  if (loading) return <p className="text-slate-500">جارٍ التحميل...</p>;
  if (empty) return <p className="text-slate-500">{emptyText}</p>;
  return null;
}

function OverviewReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report", "overview"], queryFn: api.reports.overview });
  if (isLoading || !data) return <ReportState loading empty={false} emptyText="" />;
  if (data.boards.length === 0) return <ReportState loading={false} empty emptyText="لا توجد لوحات." />;

  return (
    <div className="space-y-4">
      {data.boards.map((board) => (
        <div key={board.boardId} className="rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-semibold text-slate-900">{board.boardName}</h2>
            <span className="text-sm text-slate-500">{board.totalCards} مهمة</span>
          </div>
          {board.lists.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد قوائم.</p>
          ) : (
            <ul className="space-y-1">
              {board.lists.map((list) => (
                <li key={list.listId} className="flex items-center justify-between text-sm text-slate-700">
                  <span>{list.listName}</span>
                  <span className="text-slate-500">{list.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function CompletedReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report", "completed"], queryFn: () => api.reports.completed() });
  if (isLoading || !data) return <ReportState loading empty={false} emptyText="" />;

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm text-slate-500">
        المهام المُنجَزة منذ {formatDate(data.since)} — الإجمالي: {data.total}
      </p>
      {data.tasks.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مهام مُنجَزة في هذه المدة.</p>
      ) : (
        <ul className="space-y-2">
          {data.tasks.map((task) => (
            <li key={task.cardId} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <div>
                <span className="text-slate-800">{task.cardTitle}</span>
                <span className="text-slate-400"> — {task.boardName}</span>
              </div>
              <div className="text-xs text-slate-400">
                {task.actorName} · {formatDate(task.completedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverdueReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report", "overdue"], queryFn: api.reports.overdue });
  if (isLoading || !data) return <ReportState loading empty={false} emptyText="" />;

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm text-slate-500">الإجمالي: {data.total}</p>
      {data.tasks.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مهام متأخّرة. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {data.tasks.map((task) => (
            <li key={task.cardId} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <div>
                <span className="text-slate-800">{task.cardTitle}</span>
                <span className="text-slate-400"> — {task.boardName} / {task.listName}</span>
                {task.assigneeNames.length > 0 && (
                  <span className="text-slate-400"> · {task.assigneeNames.join("، ")}</span>
                )}
              </div>
              <div className="text-xs text-red-500">{formatDate(task.dueDate)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WorkloadReport() {
  const { data, isLoading } = useQuery({ queryKey: ["report", "workload"], queryFn: api.reports.workload });
  if (isLoading || !data) return <ReportState loading empty={false} emptyText="" />;

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      {data.assignees.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مهام مفتوحة مُسنَدة لأحد.</p>
      ) : (
        <ul className="space-y-2">
          {data.assignees.map((a) => (
            <li key={a.userId} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm">
              <div>
                <span className="text-slate-800">{a.displayName}</span>
                <span className="text-slate-400"> {a.email}</span>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{a.openCards} مهمة مفتوحة</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Recurring-task completion report. Because this page is global (not scoped to
 * a board), it starts with a board picker, then renders one grid per recurring
 * template on that board: subtasks as rows, weekly occurrences as columns, each
 * cell showing whether that subtask was done that week — answering "was X done
 * every week?". Window defaults to the previous calendar month.
 */
function RecurringReport() {
  const [boardId, setBoardId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: boards } = useQuery({ queryKey: ["boards"], queryFn: api.boards.list });
  const selectedBoardId = boardId || boards?.[0]?.id || "";

  const { data: report, isLoading } = useQuery({
    queryKey: ["recurringReport", selectedBoardId, from, to],
    queryFn: () =>
      api.reports.recurring(selectedBoardId, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      }),
    enabled: Boolean(selectedBoardId),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 text-sm shadow-sm">
        <label className="flex items-center gap-1 text-slate-500">
          اللوحة
          <select
            value={selectedBoardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          >
            {(boards ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-slate-500">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-1 text-slate-500">
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        {report && (
          <span className="text-slate-500">
            الفترة: {formatDate(report.from)} — {formatDate(report.to)}
            {!from && !to && " (الشهر الماضي افتراضياً)"}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">جارٍ تحميل التقرير...</p>
      ) : !report || report.tasks.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد مهام دورية على هذه اللوحة.</p>
      ) : (
        report.tasks.map((task) => <TaskReport key={task.recurringTaskId} task={task} />)
      )}
    </div>
  );
}

function TaskReport({ task }: { task: ReportTask }) {
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{task.title}</h2>
      {task.occurrences.length === 0 ? (
        <p className="text-sm text-slate-400">لم تُنشأ أي مهمة في هذه الفترة.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-slate-200 p-2 text-start font-medium text-slate-500">البند</th>
                {task.occurrences.map((occ) => (
                  <th
                    key={occ.cardId}
                    className="border-b border-slate-200 p-2 text-center font-medium text-slate-500"
                  >
                    {formatWeek(occ.occurrenceStart)}
                  </th>
                ))}
                <th className="border-b border-slate-200 p-2 text-center font-medium text-slate-500">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {task.subtasks.map((row) => (
                <tr key={row.recurringSubtaskId}>
                  <td className="border-b border-slate-100 p-2 text-slate-700">{row.label}</td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="border-b border-slate-100 p-2 text-center">
                      {cell.isCompleted ? (
                        <span className="text-green-600" title={cell.completedAt ? formatDate(cell.completedAt) : ""}>
                          ✓
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                  <td
                    className={
                      row.completedCount === row.totalCount
                        ? "border-b border-slate-100 p-2 text-center font-medium text-green-600"
                        : "border-b border-slate-100 p-2 text-center font-medium text-slate-600"
                    }
                  >
                    {row.completedCount}/{row.totalCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatWeek(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", { day: "numeric", month: "short" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
}
