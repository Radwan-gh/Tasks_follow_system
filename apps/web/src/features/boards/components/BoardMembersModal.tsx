import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardMember, BoardRole } from "@app/types";
import { api, ApiError } from "../../../lib/api-client";
import { useAutoSavedIds } from "../../../lib/use-auto-saved-ids";
import { UserTypeahead } from "./MemberPicker";

interface BoardMembersModalProps {
  boardId: string;
  members: BoardMember[];
  /**
   * A personal board has no members (`docs/18-board-sharing.md`): instead of
   * the picker, the modal offers to ask for the board to become shared — or
   * says the request is waiting.
   */
  personal?: { pending: boolean; onRequestSharing: () => void };
  onClose: () => void;
}

/** Short enough to feel live; the typed text is still re-matched locally on every keystroke. */
const SEARCH_DEBOUNCE_MS = 150;
/** The server's cap — enough rows for the local prefix-first ranking to pick the best 3 from. */
const CANDIDATE_LIMIT = 50;

type AddableRole = Exclude<BoardRole, "OWNER">;

/**
 * Board membership through the same picker as task assignees: type a name,
 * the top 3 matches from the user directory appear, Enter or a click adds the
 * person, and the ✕ on a chip removes them — each change saved immediately
 * (`PUT /boards/:id/members` via `useAutoSavedIds`). Newcomers join as
 * members; the role toggle on each chip switches member ⇄ viewer.
 */
export function BoardMembersModal({ boardId, members, personal, onClose }: BoardMembersModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    // The search must drop whoever was just added (or pick up whoever was
    // removed) without the owner having to retype.
    void queryClient.invalidateQueries({ queryKey: ["member-candidates", boardId] });
  };

  const serverIds = useMemo(() => members.map((m) => m.userId), [members]);
  const selection = useAutoSavedIds(serverIds, async (userIds) => {
    await api.boards.setMembers(boardId, { userIds });
    invalidate();
  });

  const updateRole = useMutation({
    mutationFn: (input: { userId: string; role: AddableRole }) =>
      api.boards.updateMemberRole(boardId, input.userId, input.role),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع"),
  });

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const candidates = useQuery({
    queryKey: ["member-candidates", boardId, debounced],
    queryFn: () => api.boards.memberCandidates(boardId, { search: debounced, limit: CANDIDATE_LIMIT }),
    enabled: debounced.length > 0,
    // Keeping the previous rows while the next search loads stops the
    // suggestions from flashing empty on every keystroke.
    placeholderData: (previous) => previous,
  });

  // Candidates in the picker's shape. Everyone ever suggested is remembered
  // so a just-added chip still resolves before the board refetch lists them.
  const pool = useMemo<BoardMember[]>(
    () =>
      (candidates.data?.users ?? []).map((user) => ({ userId: user.id, boardId, role: "MEMBER", user })),
    [candidates.data, boardId],
  );
  const seen = useRef(new Map<string, BoardMember>());
  const lookup = useMemo(() => {
    for (const m of pool) seen.current.set(m.userId, m);
    const onBoard = new Set(members.map((m) => m.userId));
    return [...members, ...[...seen.current.values()].filter((m) => !onBoard.has(m.userId))];
  }, [members, pool]);

  const ownerIds = useMemo(
    () => new Set(members.filter((m) => m.role === "OWNER").map((m) => m.userId)),
    [members],
  );
  const roleOf = useMemo(() => new Map(members.map((m) => [m.userId, m.role])), [members]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">أعضاء اللوحة</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
            إغلاق
          </button>
        </div>

        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        {personal ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/80">اللوحة شخصية، فلا أعضاء فيها.</p>
            {personal.pending ? (
              <p className="rounded-field bg-accent-soft px-3 py-2 text-sm text-ink/80">
                طلب المشاركة بانتظار الموافقة. تعمل اللوحة كلوحة شخصية حتى ذلك الحين.
              </p>
            ) : (
              <button
                type="button"
                onClick={personal.onRequestSharing}
                className="rounded-field bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                اطلب جعلها مشتركة
              </button>
            )}
          </div>
        ) : (
          <>
            <UserTypeahead
              members={pool}
              lookup={lookup}
              selectedIds={selection.ids}
              onChange={selection.change}
              saving={selection.saving}
              failed={selection.failed}
              onTermChange={setTerm}
              searching={candidates.isFetching || term.trim() !== debounced}
              noMatchText={(typed) => `لا يوجد مستخدم يطابق «${typed}» ويمكن إضافته.`}
              lockedIds={ownerIds}
              chipExtra={(m) => {
                const role = roleOf.get(m.userId);
                if (role === "OWNER") return <span className="text-[10px] font-medium text-muted">مالك</span>;
                // Not saved yet — nothing to switch until the server has the row.
                if (!role) return null;
                return (
                  <button
                    type="button"
                    disabled={updateRole.isPending}
                    onClick={() => updateRole.mutate({ userId: m.userId, role: role === "VIEWER" ? "MEMBER" : "VIEWER" })}
                    aria-label={`دور ${m.user.displayName}: ${role === "VIEWER" ? "مشاهد" : "عضو"} — اضغط للتبديل`}
                    className="rounded-full bg-surface px-1.5 text-[10px] font-medium text-muted hover:text-ink disabled:opacity-50"
                  >
                    {role === "VIEWER" ? "مشاهد ▾" : "عضو ▾"}
                  </button>
                );
              }}
              label="أضف عضوًا إلى اللوحة"
              placeholder="اكتب اسمًا أو اسم مستخدم لإضافته"
              emptyHint=""
            />

            <p className="text-[11px] text-muted">
              الأعضاء يعدّلون المهام، والمشاهدون يقرؤون فقط. اضغط الدور على أي شخص لتبديله.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
