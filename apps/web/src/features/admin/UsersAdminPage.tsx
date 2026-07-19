import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRole } from "@app/types";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";

const PAGE_SIZE = 20;

export function UsersAdminPage() {
  const { user: currentUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", debouncedSearch, page],
    queryFn: () => api.admin.listUsers({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const onMutationError = (err: unknown) => {
    setError(err instanceof ApiError ? err.message : "حدث خطأ ما");
  };
  const onMutationSuccess = () => {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.admin.updateUserRole(id, role),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.admin.updateUserStatus(id, isActive),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });

  function onRoleChange(id: string, email: string, role: UserRole) {
    const label = role === "ADMIN" ? `منح ${email} صلاحيات المشرف؟` : `إزالة صلاحيات المشرف من ${email}؟`;
    if (!window.confirm(label)) return;
    updateRole.mutate({ id, role });
  }

  function onStatusToggle(id: string, email: string, isActive: boolean) {
    const label = isActive
      ? `إعادة تفعيل ${email}؟ سيتمكن من تسجيل الدخول مرة أخرى.`
      : `إلغاء تفعيل ${email}؟ سيتم تسجيل خروجه ولن يتمكن من تسجيل الدخول. سيتم الاحتفاظ بلوحاته وبطاقاته.`;
    if (!window.confirm(label)) return;
    updateStatus.mutate({ id, isActive });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const isMutating = updateRole.isPending || updateStatus.isPending;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-900">المستخدمون والصلاحيات</h1>
          <Link to="/boards" className="text-sm text-slate-500 underline">
            العودة إلى اللوحات
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{currentUser?.displayName}</span>
          <button onClick={logout} className="text-slate-500 underline">
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالبريد الإلكتروني أو الاسم"
            className="w-72 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {data && (
            <span className="text-sm text-slate-500">
              {data.total} {data.total === 1 ? "مستخدم" : "مستخدم"}
            </span>
          )}
        </div>

        {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        {isLoading && <p className="text-slate-500">جارٍ تحميل المستخدمين...</p>}
        {!isLoading && data?.users.length === 0 && <p className="text-slate-500">لا يوجد مستخدمون يطابقون بحثك.</p>}

        {data && data.users.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">الاسم</th>
                  <th className="px-4 py-3">البريد الإلكتروني</th>
                  <th className="px-4 py-3">الصلاحية</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">اللوحات</th>
                  <th className="px-4 py-3">تاريخ الانضمام</th>
                  <th className="px-4 py-3">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="border-b last:border-b-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {u.displayName}
                        {isSelf && <span className="ms-2 text-xs text-slate-400">(أنت)</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            u.role === "ADMIN"
                              ? "rounded bg-slate-900 px-2 py-0.5 text-xs font-medium text-white"
                              : "rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                          }
                        >
                          {u.role === "ADMIN" ? "مشرف" : "مستخدم"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            u.isActive
                              ? "rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                              : "rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600"
                          }
                        >
                          {u.isActive ? "نشط" : "غير مفعّل"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.boardCount}</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(u.createdAt).toLocaleDateString("ar")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onRoleChange(u.id, u.email, u.role === "ADMIN" ? "USER" : "ADMIN")}
                            disabled={isSelf || isMutating}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {u.role === "ADMIN" ? "خفض إلى مستخدم" : "تعيين كمشرف"}
                          </button>
                          <button
                            onClick={() => onStatusToggle(u.id, u.email, !u.isActive)}
                            disabled={isSelf || isMutating}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {u.isActive ? "إلغاء التفعيل" : "إعادة التفعيل"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > data.pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              السابق
            </button>
            <span>
              صفحة {page} من {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
