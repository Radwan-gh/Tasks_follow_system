import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api-client";
import { useCurrencySymbol } from "../../../lib/use-app-settings";

/** `GET /boards/:id/summary` — an owner-only alternative to the ADMIN-only `/reports` section, scoped to one board. */
export function BoardOwnerSummaryPanel({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["board-summary", boardId], queryFn: () => api.boards.getSummary(boardId) });
  const currencySymbol = useCurrencySymbol();

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-card bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">ملخّص اللوحة</h2>
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            إغلاق
          </button>
        </div>

        {!data ? (
          <p className="text-sm text-muted">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-field bg-canvas px-3 py-2 text-sm">
              <span className="text-ink/70">منجَز آخر 7 أيام</span>
              <span className="font-semibold text-ink">{data.completedLast7Days}</span>
            </div>
            <div className="flex items-center justify-between rounded-field bg-canvas px-3 py-2 text-sm">
              <span className="text-ink/70">متأخّر حاليًا</span>
              <span className="font-semibold text-alert">{data.overdueCount}</span>
            </div>
            {data.costThisMonth && (
              <div className="flex items-center justify-between rounded-field bg-canvas px-3 py-2 text-sm">
                <span className="text-ink/70">تكاليف هذا الشهر</span>
                <span className="font-semibold text-ink">
                  {data.costThisMonth} {currencySymbol}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-muted">عبء العمل</span>
              {data.workload.map((w) => (
                <div key={w.userId} className="flex items-center justify-between text-sm">
                  <span className="text-ink/80">{w.displayName}</span>
                  <span className="text-muted">{w.openCards} مهمة</span>
                </div>
              ))}
              {data.workloadRestCount > 0 && (
                <p className="text-xs text-muted">و{data.workloadRestCount} آخرين</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
