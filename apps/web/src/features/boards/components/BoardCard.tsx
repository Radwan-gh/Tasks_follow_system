import { Link } from "react-router-dom";
import type { BoardSummary } from "@app/types";
import { UserAvatar } from "./MemberPicker";

/** One board tile on `/boards` — enriched with the aggregates `GET /boards` already returns. */
export function BoardCard({ board, isOwner }: { board: BoardSummary; isOwner: boolean }) {
  const progress = board.cardCount > 0 ? Math.round((board.doneCount / board.cardCount) * 100) : 0;
  const previews = board.memberPreviews.slice(0, 3);
  const extraMembers = board.memberCount - previews.length;

  return (
    <Link
      to={`/boards/${board.id}`}
      className="block rounded-card border border-line bg-surface p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-ink">{board.name}</span>
            {isOwner && (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                مالك
              </span>
            )}
          </div>
          {board.description && <p className="mt-1 truncate text-sm text-muted">{board.description}</p>}
        </div>
      </div>

      {board.dueDate && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink/70">
          ◷ التسليم {new Date(board.dueDate).toLocaleDateString("ar", { dateStyle: "medium" })}
        </span>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-status-done" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">
          {board.cardCount} مهمة · {board.doneCount} مكتملة
        </span>
        {previews.length > 0 && (
          <div className="flex items-center">
            {previews.map((member, i) => (
              <span key={member.id} className={i > 0 ? "-ms-2" : ""} style={{ zIndex: previews.length - i }}>
                <span className="block rounded-full ring-2 ring-surface">
                  <UserAvatar displayName={member.displayName} />
                </span>
              </span>
            ))}
            {extraMembers > 0 && (
              <span className="-ms-2 flex h-7 w-7 items-center justify-center rounded-full bg-line text-[10px] font-semibold text-ink/70 ring-2 ring-surface">
                +{extraMembers}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
