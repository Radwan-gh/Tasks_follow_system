import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SimilarBoard } from "@app/types";
import { api } from "../../../lib/api-client";
import { UserAvatar } from "./MemberPicker";

/** Long enough that typing a name doesn't fire a lookup per keystroke. */
const DEBOUNCE_MS = 400;
/** One letter matches too much to be a useful hint. */
const MIN_NAME_LENGTH = 2;

/**
 * «لوحات بأسماء مشابهة» — the check before asking for a shared board: boards
 * that already exist (or are waiting for approval) under a name like this one,
 * so the person can ask that board's owner to add them instead of starting a
 * duplicate. Matching is the server's Arabic-aware comparison
 * (`GET /board-share-requests/similar`); nothing renders until a name is typed.
 */
export function SimilarBoardsPanel({ name, excludeBoardId }: { name: string; excludeBoardId?: string }) {
  const [debounced, setDebounced] = useState(name.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(name.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  const enabled = debounced.length >= MIN_NAME_LENGTH;
  const similar = useQuery({
    queryKey: ["similar-boards", debounced, excludeBoardId ?? null],
    queryFn: () => api.boardSharing.similar(debounced, excludeBoardId),
    enabled,
    placeholderData: (previous) => previous,
  });

  if (!enabled) return null;
  const boards = similar.data ?? [];

  if (boards.length === 0) {
    return (
      <p className="text-xs text-muted" aria-live="polite">
        {similar.isFetching ? "يجري البحث عن لوحات بأسماء مشابهة…" : "لا لوحات بأسماء مشابهة."}
      </p>
    );
  }

  return (
    <section aria-live="polite" className="overflow-hidden rounded-field border border-accent/25 bg-accent-soft/60">
      <div className="px-3.5 pb-2 pt-3">
        <h3 className="text-sm font-bold text-ink">لوحات بأسماء مشابهة</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-ink/70">
          لعلّ اللوحة التي تريدها موجودة: اطلب من صاحبها أن يضيفك بدل إنشاء لوحة جديدة.
        </p>
      </div>
      <ul className="divide-y divide-line border-t border-accent/15 bg-surface">
        {boards.map((board) => (
          <SimilarBoardRow key={board.id} board={board} />
        ))}
      </ul>
    </section>
  );
}

export function SimilarBoardRow({ board }: { board: SimilarBoard }) {
  return (
    <li className="flex items-start gap-3 px-3.5 py-2.5">
      <UserAvatar displayName={board.owner.displayName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{board.name}</span>
          {board.pending && (
            <span className="shrink-0 rounded-full bg-urgent-bg px-2 py-0.5 text-[10px] font-semibold text-urgent">
              بانتظار الموافقة
            </span>
          )}
        </div>
        {board.description && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink/70">{board.description}</p>}
        <p className="mt-1 text-[11px] text-muted">
          صاحبها {board.owner.displayName}، {membersLabel(board.memberCount)}
        </p>
      </div>
    </li>
  );
}

/** Arabic number agreement: عضو واحد، عضوان، ٣–١٠ أعضاء، ١١+ عضوًا. */
function membersLabel(count: number): string {
  if (count === 1) return "عضو واحد";
  if (count === 2) return "عضوان";
  if (count >= 3 && count <= 10) return `${count} أعضاء`;
  return `${count} عضوًا`;
}
