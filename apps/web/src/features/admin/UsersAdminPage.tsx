import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUser, UpdateUserRequest, UserRole } from "@app/types";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { EditUserModal } from "./EditUserModal";

const PAGE_SIZE = 20;

export function UsersAdminPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Row currently open in the edit dialog. Its own error is kept separate from
  // the page-level one so it shows inside the dialog, next to the fields.
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // New-user form state.
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  // Email is contact info, not a credential — the server accepts it as null.
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

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
    setNotice(null);
    setError(err instanceof ApiError ? err.message : "حدث خطأ ما");
  };
  const onMutationSuccess = () => {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const createUser = useMutation({
    mutationFn: (vars: {
      username: string;
      email: string | null;
      password: string;
      displayName: string;
      role: UserRole;
    }) => api.admin.createUser(vars),
    onSuccess: (created) => {
      onMutationSuccess();
      setNotice(`تم إنشاء الحساب ${created.username}.`);
      setNewName("");
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      setNewIsAdmin(false);
    },
    onError: onMutationError,
  });

  const updateUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) => api.admin.updateUser(id, body),
    onSuccess: (updated) => {
      onMutationSuccess();
      setEditing(null);
      setEditError(null);
      setNotice(`تم تحديث بيانات ${updated.email}.`);
    },
    onError: (err: unknown) => setEditError(err instanceof ApiError ? err.message : "حدث خطأ ما"),
  });

  const setPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.admin.setUserPassword(id, password),
    onSuccess: (updated) => {
      onMutationSuccess();
      setNotice(`تم تغيير كلمة مرور ${updated.username}.`);
    },
    onError: onMutationError,
  });

  function onCreateUser(e: FormEvent) {
    e.preventDefault();
    createUser.mutate({
      // Usernames are lowercase-only server-side; normalise here so typing a
      // capital is not rejected as an invalid name.
      username: newUsername.trim().toLowerCase(),
      email: newEmail.trim() || null,
      password: newPassword,
      displayName: newName.trim(),
      role: newIsAdmin ? "ADMIN" : "USER",
    });
  }

  function onSetPassword(id: string, username: string) {
    const password = window.prompt(`أدخل كلمة مرور جديدة لـ ${username} (8 أحرف على الأقل):`);
    if (password === null) return;
    if (password.length < 8) {
      setNotice(null);
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    setPassword.mutate({ id, password });
  }

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

  function onRoleChange(id: string, username: string, role: UserRole) {
    const label = role === "ADMIN" ? `منح ${username} صلاحيات المشرف؟` : `إزالة صلاحيات المشرف من ${username}؟`;
    if (!window.confirm(label)) return;
    updateRole.mutate({ id, role });
  }

  function onStatusToggle(id: string, username: string, isActive: boolean) {
    const label = isActive
      ? `إعادة تفعيل ${username}؟ سيتمكن من تسجيل الدخول مرة أخرى.`
      : `إلغاء تفعيل ${username}؟ سيتم تسجيل خروجه ولن يتمكن من تسجيل الدخول. سيتم الاحتفاظ بلوحاته وبطاقاته.`;
    if (!window.confirm(label)) return;
    updateStatus.mutate({ id, isActive });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const isMutating = updateRole.isPending || updateStatus.isPending || setPassword.isPending || updateUser.isPending;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center gap-4 border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">المستخدمون والصلاحيات</h1>
        <Link to="/boards" className="text-sm text-slate-500 underline">
          العودة إلى اللوحات
        </Link>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم المستخدم أو الاسم أو البريد الإلكتروني"
            className="w-72 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          {data && (
            <span className="text-sm text-slate-500">
              {data.total} {data.total === 1 ? "مستخدم" : "مستخدم"}
            </span>
          )}
        </div>

        {error && <div className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {notice && <div className="mb-4 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>}

        <form onSubmit={onCreateUser} className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">إنشاء مستخدم جديد</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="الاسم"
              className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="اسم المستخدم"
              autoComplete="username"
              className="w-40 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="البريد الإلكتروني (اختياري)"
              className="w-56 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="كلمة المرور (8 أحرف على الأقل)"
              className="w-56 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
              مشرف
            </label>
            <button
              type="submit"
              disabled={createUser.isPending}
              className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {createUser.isPending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
            </button>
          </div>
        </form>

        {isLoading && <p className="text-slate-500">جارٍ تحميل المستخدمين...</p>}
        {!isLoading && data?.users.length === 0 && <p className="text-slate-500">لا يوجد مستخدمون يطابقون بحثك.</p>}

        {data && data.users.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">الاسم</th>
                  <th className="px-4 py-3">اسم المستخدم</th>
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
                      <td className="px-4 py-3 text-slate-600">{u.username}</td>
                      <td className="px-4 py-3 text-slate-600">{u.email ?? "—"}</td>
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
                            onClick={() => onRoleChange(u.id, u.username, u.role === "ADMIN" ? "USER" : "ADMIN")}
                            disabled={isSelf || isMutating}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {u.role === "ADMIN" ? "خفض إلى مستخدم" : "تعيين كمشرف"}
                          </button>
                          <button
                            onClick={() => onStatusToggle(u.id, u.username, !u.isActive)}
                            disabled={isSelf || isMutating}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {u.isActive ? "إلغاء التفعيل" : "إعادة التفعيل"}
                          </button>
                          <button
                            onClick={() => {
                              setEditError(null);
                              setEditing(u);
                            }}
                            disabled={isMutating}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            تعديل البيانات
                          </button>
                          <button
                            onClick={() => onSetPassword(u.id, u.username)}
                            disabled={isMutating}
                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            تغيير كلمة المرور
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

        {editing && (
          <EditUserModal
            user={editing}
            saving={updateUser.isPending}
            error={editError}
            onClose={() => {
              setEditing(null);
              setEditError(null);
            }}
            onSave={(body) => updateUser.mutate({ id: editing.id, body })}
          />
        )}
      </main>
    </div>
  );
}
