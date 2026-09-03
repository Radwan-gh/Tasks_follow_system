import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ExportableReport } from "@app/api-client";
import { api } from "../../lib/api-client";

type Tab = ExportableReport;

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "نظرة عامة على اللوحات" },
  { id: "completed", label: "المُنجَز آخر أسبوع" },
  { id: "overdue", label: "المهام المتأخّرة" },
  { id: "workload", label: "عبء العمل حسب الشخص" },
];

/** §3c-6 "تصدير التقارير — GET /reports/export": triggers a browser download of the current tab's PDF. */
async function downloadReportPdf(report: Tab) {
  const blob = await api.reports.exportPdf(report);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${report}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ExportButton({ report }: { report: Tab }) {
  const [state, setState] = useState<"idle" | "generating" | "error">("idle");

  async function onClick() {
    setState("generating");
    try {
      await downloadReportPdf(report);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={state === "generating"}
      className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {state === "generating" ? "جارٍ التوليد..." : state === "error" ? "تعذّر التوليد — إعادة المحاولة" : "تصدير PDF"}
    </button>
  );
}

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
        <nav className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
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
          </div>
          <ExportButton report={tab} />
        </nav>

        {tab === "overview" && <OverviewReport />}
        {tab === "completed" && <CompletedReport />}
        {tab === "overdue" && <OverdueReport />}
        {tab === "workload" && <WorkloadReport />}
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
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  if (isLoading || !data) return <ReportState loading empty={false} emptyText="" />;
  if (data.boards.length === 0) return <ReportState loading={false} empty emptyText="لا توجد لوحات." />;

  const currencySymbol = settings.data?.currencySymbol ?? "";

  return (
    <div className="space-y-4">
      {/* §3c-1 "بطاقة جديدة «التكاليف حسب اللوحة»" */}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold text-slate-900">التكاليف حسب اللوحة (هذا الشهر)</h2>
        {data.boards.every((b) => !b.costThisMonth) ? (
          <p className="text-sm text-slate-400">لا تكاليف مسجَّلة هذا الشهر.</p>
        ) : (
          <ul className="space-y-1">
            {data.boards
              .filter((b) => b.costThisMonth)
              .map((b) => (
                <li key={b.boardId} className="flex items-center justify-between text-sm text-slate-700">
                  <span>{b.boardName}</span>
                  <span className="text-slate-500">
                    {b.costThisMonth} {currencySymbol}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>

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
            <li
              key={a.userId}
              className={`flex items-center justify-between rounded border-b border-slate-100 px-2 pb-2 pt-1 text-sm ${
                a.isActive ? "" : "bg-red-50"
              }`}
            >
              <div>
                <span className="text-slate-800">{a.displayName}</span>
                <span className="text-slate-400"> {a.email}</span>
                {!a.isActive && (
                  <span className="ms-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                    يحتاج إعادة إسناد — معطَّل
                  </span>
                )}
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{a.openCards} مهمة مفتوحة</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
}
