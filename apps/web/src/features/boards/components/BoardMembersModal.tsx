import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BoardMember, PublicUser } from "@app/types";
import { api, ApiError } from "../../../lib/api-client";

interface BoardMembersModalProps {
  boardId: string;
  members: BoardMember[];
  onClose: () => void;
}

const DIRECTORY_PAGE_SIZE = 20;

export function BoardMembersModal({ boardId, members, onClose }: BoardMembersModalProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Directory search (debounced) for the "browse existing users" picker.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["board", boardId] });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "حدث خطأ ما");

  const addMember = useMutation({
    mutationFn: (value: string) => api.boards.addMember(boardId, value),
    onSuccess: () => {
      setError(null);
      setEmail("");
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

  const directory = useInfiniteQuery({
    queryKey: ["user-directory", debouncedSearch],
    queryFn: ({ pageParam }) =>
      api.users.list({ search: debouncedSearch || undefined, page: pageParam, pageSize: DIRECTORY_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

  // Lazy-load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && directory.hasNextPage && !directory.isFetchingNextPage) {
        directory.fetchNextPage();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [directory.hasNextPage, directory.isFetchingNextPage, directory.fetchNextPage]);

  const memberIds = new Set(members.map((m) => m.userId));
  const directoryUsers: PublicUser[] = directory.data?.pages.flatMap((p) => p.users) ?? [];
  const total = directory.data?.pages[0]?.total ?? 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    addMember.mutate(email.trim());
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">أعضاء اللوحة</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
            إغلاق
          </button>
        </div>

        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="إضافة عضو بالبريد الإلكتروني"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={addMember.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            إضافة
          </button>
        </form>

        {/* Current members */}
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">الأعضاء الحاليون</h3>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-900">{m.user.displayName}</span>
                  <span className="ms-2 text-slate-500">{m.user.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      m.role === "OWNER"
                        ? "rounded bg-slate-900 px-2 py-0.5 text-xs font-medium text-white"
                        : "rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                    }
                  >
                    {m.role === "OWNER" ? "المالك" : "عضو"}
                  </span>
                  {m.role !== "OWNER" && (
                    <button
                      onClick={() => {
                        if (window.confirm(`إزالة ${m.user.email} من هذه اللوحة؟`)) removeMember.mutate(m.userId);
                      }}
                      disabled={removeMember.isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      إزالة
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Browse existing users in the system */}
        <div className="flex min-h-0 flex-1 flex-col">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            مستخدمو النظام{total ? ` (${total})` : ""}
          </h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو البريد الإلكتروني"
            className="mb-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded border border-slate-100">
            {directory.isLoading ? (
              <p className="p-3 text-sm text-slate-400">جارٍ تحميل المستخدمين...</p>
            ) : directoryUsers.length === 0 ? (
              <p className="p-3 text-sm text-slate-400">لا يوجد مستخدمون مطابقون.</p>
            ) : (
              <ul className="divide-y">
                {directoryUsers.map((u) => {
                  const already = memberIds.has(u.id);
                  return (
                    <li key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-900">{u.displayName}</span>
                        <span className="ms-2 truncate text-slate-500">{u.email}</span>
                      </div>
                      {already ? (
                        <span className="shrink-0 text-xs text-slate-400">عضو بالفعل</span>
                      ) : (
                        <button
                          onClick={() => addMember.mutate(u.email)}
                          disabled={addMember.isPending}
                          className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          إضافة
                        </button>
                      )}
                    </li>
                  );
                })}
                <div ref={sentinelRef} />
                {directory.isFetchingNextPage && (
                  <li className="px-3 py-2 text-center text-xs text-slate-400">جارٍ التحميل...</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
