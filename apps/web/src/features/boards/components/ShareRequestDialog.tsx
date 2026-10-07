import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BoardSummary } from "@app/types";
import { api, ApiError } from "../../../lib/api-client";
import { SimilarBoardsPanel } from "./SimilarBoardsPanel";

/**
 * Ask for a personal board to become shared — first time, or again after a
 * rejection (`POST /board-share-requests`). The scope is required because it
 * is what the approver judges duplicates by; it replaces the board's
 * description. An approver's own request is granted on the spot.
 */
export function ShareRequestDialog({
  board,
  onClose,
}: {
  board: Pick<BoardSummary, "id" | "name" | "description">;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState(board.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () => api.boardSharing.request({ boardId: board.id, description: scope.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", board.id] });
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setError("لهذه اللوحة طلب بانتظار الموافقة، أو صارت مشتركة.");
      else setError(err instanceof ApiError ? err.message : "تعذّر إرسال الطلب");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (scope.trim()) request.mutate();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-card bg-surface p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold text-ink">جعل «{board.name}» مشتركة</h2>
        <p className="text-sm leading-relaxed text-ink/70">
          يراجع الموافِق الطلب ويقارنه باللوحات الموجودة. حتى ذلك الحين تبقى اللوحة شخصية وتعمل كالمعتاد.
        </p>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">نطاق اللوحة</span>
          <textarea
            required
            autoFocus
            value={scope}
            maxLength={2000}
            onChange={(e) => setScope(e.target.value)}
            rows={3}
            placeholder="ما الذي تتابعه هذه اللوحة، ولمن؟"
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <SimilarBoardsPanel name={board.name} excludeBoardId={board.id} />

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-field px-3 py-1.5 text-sm text-ink/70 hover:bg-canvas">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={!scope.trim() || request.isPending}
            className="rounded-field bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {request.isPending ? "جارٍ الإرسال..." : "إرسال الطلب"}
          </button>
        </div>
      </form>
    </div>
  );
}
