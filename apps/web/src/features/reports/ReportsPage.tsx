import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ReportTask } from "@app/types";
import { api } from "../../lib/api-client";

/**
 * Completion report for a board's recurring tasks. Renders one grid per
 * template: subtasks as rows, weekly occurrences as columns, each cell showing
 * whether that subtask was done that week — answering "was X done every week?".
 */
export function ReportsPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: board } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api.boards.get(boardId!),
    enabled: Boolean(boardId),
  });

  const { data: report, isLoading } = useQuery({
    queryKey: ["recurringReport", boardId, from, to],
    queryFn: () =>
      api.reports.recurring(boardId!, {
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to).toISOString() : undefined,
      }),
    enabled: Boolean(boardId),
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex flex-wrap items-center gap-4 border-b bg-white px-6 py-4">
        <Link to={`/boards/${boardId}`} className="text-sm text-slate-500 hover:underline">
          → اللوحة
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">
          تقرير الإنجاز {board ? `— ${board.name}` : ""}
        </h1>
        <div className="ms-auto flex items-center gap-3 text-sm">
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
        </div>
      </header>

      <main className="space-y-8 p-6">
        {report && (
          <p className="text-sm text-slate-500">
            الفترة: {formatDate(report.from)} — {formatDate(report.to)}
            {!from && !to && " (الشهر الماضي افتراضياً)"}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">جارٍ تحميل التقرير...</p>
        ) : !report || report.tasks.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد مهام دورية على هذه اللوحة.</p>
        ) : (
          report.tasks.map((task) => <TaskReport key={task.recurringTaskId} task={task} />)
        )}
      </main>
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
                <th className="border-b border-slate-200 p-2 text-start font-medium text-slate-500">
                  البند
                </th>
                {task.occurrences.map((occ) => (
                  <th
                    key={occ.cardId}
                    className="border-b border-slate-200 p-2 text-center font-medium text-slate-500"
                  >
                    {formatWeek(occ.occurrenceStart)}
                  </th>
                ))}
                <th className="border-b border-slate-200 p-2 text-center font-medium text-slate-500">
                  الإجمالي
                </th>
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
