import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";

export function BoardsListPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: boards, isLoading } = useQuery({ queryKey: ["boards"], queryFn: api.boards.list });
  const [name, setName] = useState("");

  const createBoard = useMutation({
    mutationFn: (name: string) => api.boards.create({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["boards"] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createBoard.mutate(name.trim());
    setName("");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">اللوحات</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          {user?.role === "ADMIN" && (
            <Link to="/admin/users" className="text-slate-500 underline">
              المستخدمون والصلاحيات
            </Link>
          )}
          <span>{user?.displayName}</span>
          <button onClick={logout} className="text-slate-500 underline">
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <form onSubmit={onSubmit} className="mb-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم اللوحة الجديدة"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={createBoard.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            إنشاء لوحة
          </button>
        </form>

        {isLoading && <p className="text-slate-500">جارٍ تحميل اللوحات...</p>}
        {!isLoading && boards?.length === 0 && <p className="text-slate-500">لا توجد لوحات بعد — أنشئ واحدة بالأعلى.</p>}

        <ul className="space-y-2">
          {boards?.map((board) => (
            <li key={board.id}>
              <Link
                to={`/boards/${board.id}`}
                className="block rounded-lg bg-white p-4 shadow-sm hover:shadow"
              >
                <span className="font-medium text-slate-900">{board.name}</span>
                {board.description && (
                  <p className="mt-1 truncate text-sm text-slate-500">{board.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
