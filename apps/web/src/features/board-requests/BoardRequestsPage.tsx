import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardShareRequest, BoardShareRequestStatus } from "@app/types";
import { api, ApiError } from "../../lib/api-client";
import { SimilarBoardRow } from "../boards/components/SimilarBoardsPanel";

/**
 * «طلبات اللوحات» — the approver queue (`docs/18-board-sharing.md`): requests
 * to turn a personal board shared, each next to the existing boards with a
 * similar name, so the approver can spot a duplicate before approving. For an
 * ADMIN or a user granted `canApproveBoards`; the server checks again.
 */
const TABS: { status: BoardShareRequestStatus; label: string; empty: string }[] = [
  { status: "PENDING", label: "بانتظار القرار", empty: "لا طلبات بانتظار القرار." },
  { status: "APPROVED", label: "المقبولة", empty: "لا طلبات مقبولة بعد." },
  { status: "REJECTED", label: "المرفوضة", empty: "لا طلبات مرفوضة." },
];

export const BOARD_REQUESTS_KEY = ["board-share-requests"] as const;

export function BoardRequestsPage() {
  const [status, setStatus] = useState<BoardShareRequestStatus>("PENDING");
  const tab = TABS.find((t) => t.status === status)!;
  const { data: requests, isLoading, isError } = useQuery({
    queryKey: [...BOARD_REQUESTS_KEY, status],
    queryFn: () => api.boardSharing.list(status),
  });

  return (
    <div className="min-h-full bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">طلبات اللوحات</h1>
          <p className="text-xs text-muted">طلبات جعل اللوحات مشتركة. قارن كل طلب باللوحات المشابهة قبل الموافقة.</p>
        </div>
        <div role="tablist" className="flex rounded-field bg-canvas p-1">
          {TABS.map((t) => (
            <button
              key={t.status}
              role="tab"
              aria-selected={status === t.status}
              onClick={() => setStatus(t.status)}
              className={`min-h-[36px] rounded-field px-4 text-sm ${
                status === t.status ? "bg-surface font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-6">
        {isLoading && <p className="text-muted">جارٍ تحميل الطلبات...</p>}
        {isError && <p className="text-alert">تعذّر تحميل الطلبات.</p>}
        {requests?.length === 0 && <p className="text-muted">{tab.empty}</p>}
        {requests?.map((request) => <RequestCard key={request.id} request={request} />)}
      </main>
    </div>
  );
}

function RequestCard({ request }: { request: BoardShareRequest }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: BOARD_REQUESTS_KEY });
  }
  function onError(err: unknown) {
    if (err instanceof ApiError && err.status === 409) {
      setError("قرّر موافِق آخر هذا الطلب للتوّ.");
      refresh();
    } else {
      setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع");
    }
  }

  const approve = useMutation({ mutationFn: () => api.boardSharing.approve(request.id), onSuccess: refresh, onError });
  const reject = useMutation({
    mutationFn: () => api.boardSharing.reject(request.id, reason.trim()),
    onSuccess: refresh,
    onError,
  });
  const busy = approve.isPending || reject.isPending;
  const date = (iso: string) => new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="space-y-2 p-5">
        <h2 className="font-semibold text-ink">{request.board.name}</h2>
        {request.board.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{request.board.description}</p>
        )}
        <p className="text-xs text-muted">
          طلبها {request.requestedBy.displayName} (<bdi dir="ltr">@{request.requestedBy.username}</bdi>) في{" "}
          {date(request.createdAt)}
        </p>
      </div>

      <div className="border-t border-line bg-canvas/60">
        <h3 className="px-5 pt-3 text-xs font-bold text-ink/70">لوحات مشابهة</h3>
        {request.similarBoards.length > 0 ? (
          <ul className="divide-y divide-line px-1.5 pb-1">
            {request.similarBoards.map((board) => (
              <SimilarBoardRow key={board.id} board={board} />
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-3 pt-1 text-sm text-muted">لا لوحات بأسماء مشابهة.</p>
        )}
      </div>

      {request.status === "PENDING" ? (
        <div className="space-y-3 border-t border-line p-5">
          {error && <p className="text-sm text-alert">{error}</p>}
          {rejecting ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) reject.mutate();
              }}
            >
              <label className="block space-y-1">
                <span className="text-sm text-ink/70">سبب الرفض (يصل إلى صاحب الطلب)</span>
                <textarea
                  required
                  autoFocus
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-field border border-line px-3 py-2 text-sm"
                />
              </label>
              {request.similarBoards.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {request.similarBoards.map((board) => (
                    <button
                      key={board.id}
                      type="button"
                      onClick={() => setReason(`توجد لوحة: ${board.name}`)}
                      className="rounded-full border border-line px-2.5 py-1 text-xs text-ink/80 hover:bg-canvas"
                    >
                      توجد لوحة: {board.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!reason.trim() || busy}
                  className="rounded-field bg-alert px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  تأكيد الرفض
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="rounded-field px-3 py-1.5 text-sm text-ink/70 hover:bg-canvas"
                >
                  إلغاء
                </button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => approve.mutate()}
                disabled={busy}
                className="rounded-field bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                موافقة
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setRejecting(true);
                }}
                disabled={busy}
                className="rounded-field border border-line px-4 py-1.5 text-sm font-medium text-ink hover:bg-canvas disabled:opacity-50"
              >
                رفض
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 border-t border-line px-5 py-3 text-sm">
          <p className="text-ink/80">
            {request.status === "APPROVED" ? "وافق عليها" : "رفضها"} {request.decidedBy?.displayName ?? "حساب محذوف"}
            {request.decidedAt && <span className="text-muted"> في {date(request.decidedAt)}</span>}
          </p>
          {request.reason && <p className="text-ink/70">السبب: {request.reason}</p>}
        </div>
      )}
    </article>
  );
}
