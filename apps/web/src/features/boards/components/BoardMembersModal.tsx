import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardMember, BoardMemberCandidate, BoardRole } from "@app/types";
import { api, ApiError } from "../../../lib/api-client";
import { UserIdentity, matchesUser } from "./MemberPicker";

interface BoardMembersModalProps {
  boardId: string;
  members: BoardMember[];
  onClose: () => void;
}

/** Long enough that the owner is still typing a name, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;
/** Above this, the current-members list gets its own filter box. */
const FILTER_THRESHOLD = 6;

type AddableRole = Exclude<BoardRole, "OWNER">;

export function BoardMembersModal({ boardId, members, onClose }: BoardMembersModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["board", boardId] });
    // The search must drop whoever was just added (or pick up whoever was
    // removed) without the owner having to retype.
    void queryClient.invalidateQueries({ queryKey: ["member-candidates", boardId] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع");

  const addMember = useMutation({
    mutationFn: (input: { userId: string; role: AddableRole }) =>
      api.boards.addMember(boardId, input.userId, input.role),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.boards.removeMember(boardId, userId),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError,
  });

  const [memberFilter, setMemberFilter] = useState("");
  const visibleMembers = useMemo(
    () => (memberFilter.trim() ? members.filter((m) => matchesUser(m.user, memberFilter)) : members),
    [members, memberFilter],
  );

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

        <AddMemberSearch
          boardId={boardId}
          adding={addMember.isPending}
          onPick={(user, role) => addMember.mutate({ userId: user.id, role })}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              الأعضاء الحاليون ({members.length})
            </h3>
          </div>

          {members.length >= FILTER_THRESHOLD && (
            <input
              type="search"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              placeholder="تصفية الأعضاء الحاليين"
              aria-label="تصفية الأعضاء الحاليين"
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            />
          )}

          {visibleMembers.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">لا يوجد عضو يطابق «{memberFilter.trim()}».</p>
          ) : (
            <ul className="divide-y">
              {visibleMembers.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 py-2">
                  <UserIdentity
                    displayName={m.user.displayName}
                    username={m.user.username}
                    isActive={m.user.isActive}
                  />
                  <span
                    className={
                      m.role === "OWNER"
                        ? "shrink-0 rounded bg-slate-900 px-2 py-0.5 text-xs font-medium text-white"
                        : "shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                    }
                  >
                    {roleLabel(m.role)}
                  </span>
                  {m.role !== "OWNER" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`إزالة ${m.user.displayName} من هذه اللوحة؟`))
                          removeMember.mutate(m.userId);
                      }}
                      disabled={removeMember.isPending}
                      className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      إزالة
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Type-ahead over `GET /boards/:id/member-candidates` — the owner searches by
 * name *or* username instead of having to recall an exact handle. The list opens
 * with the first candidates already loaded (empty search is a valid query), and
 * arrow keys + Enter add without touching the mouse.
 */
function AddMemberSearch({
  boardId,
  adding,
  onPick,
}: {
  boardId: string;
  adding: boolean;
  onPick: (user: BoardMemberCandidate, role: AddableRole) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState<AddableRole>("MEMBER");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ["member-candidates", boardId, debounced],
    queryFn: () => api.boards.memberCandidates(boardId, { search: debounced || undefined }),
    // Keeping the previous page visible while the next one loads stops the
    // list from flashing empty on every keystroke.
    placeholderData: (previous) => previous,
  });

  const candidates = data?.users ?? [];

  useEffect(() => {
    setHighlight(0);
  }, [debounced]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, candidates.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(candidates[highlight]);
    }
  }

  function pick(user: BoardMemberCandidate | undefined) {
    if (!user || adding) return;
    onPick(user, role);
    setSearch("");
    setDebounced("");
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  return (
    <div className="space-y-2 rounded border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          placeholder="ابحث بالاسم أو اسم المستخدم لإضافة عضو"
          aria-label="ابحث عن مستخدم لإضافته"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AddableRole)}
          aria-label="دور العضو الجديد"
          className="rounded border border-slate-300 px-2 py-2 text-sm text-slate-700"
        >
          <option value="MEMBER">عضو</option>
          <option value="VIEWER">مشاهد</option>
        </select>
      </div>

      {candidates.length === 0 ? (
        <p className="px-1 py-2 text-xs text-slate-400">
          {isFetching
            ? "جارٍ البحث..."
            : debounced
              ? `لا يوجد مستخدم يطابق «${debounced}» ويمكن إضافته.`
              : "كل المستخدمين أعضاء في هذه اللوحة بالفعل."}
        </p>
      ) : (
        <ul ref={listRef} className="max-h-56 space-y-1 overflow-y-auto">
          {candidates.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                data-highlighted={index === highlight}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(user)}
                disabled={adding}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-start disabled:opacity-50 ${
                  index === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                }`}
              >
                <UserIdentity displayName={user.displayName} username={user.username} isActive={user.isActive} />
                <span className="shrink-0 text-xs font-medium text-slate-500">إضافة +</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data?.hasMore && (
        <p className="text-[11px] text-slate-400">تُعرض أوائل النتائج فقط — تابع الكتابة لتضييق البحث.</p>
      )}
    </div>
  );
}

function roleLabel(role: BoardRole): string {
  if (role === "OWNER") return "مالك";
  return role === "VIEWER" ? "مشاهد" : "عضو";
}
