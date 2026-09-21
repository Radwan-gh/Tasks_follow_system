import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBoardRequest } from "@app/types";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { BoardCard } from "./components/BoardCard";
import { CreateBoardModal } from "./components/CreateBoardModal";

export function BoardsListPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: boards, isLoading } = useQuery({ queryKey: ["boards"], queryFn: api.boards.list });
  const [creatingOpen, setCreatingOpen] = useState(false);

  const createBoard = useMutation({
    mutationFn: (input: CreateBoardRequest) => api.boards.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      setCreatingOpen(false);
    },
  });

  return (
    <div className="min-h-full bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-ink">اللوحات</h1>
        <div className="flex items-center gap-3">
          {user?.role === "ADMIN" && (
            <div className="flex items-center gap-3 text-sm text-muted">
              <Link to="/reports" className="hover:text-ink">
                التقارير
              </Link>
              <Link to="/admin/users" className="hover:text-ink">
                المستخدمون والصلاحيات
              </Link>
            </div>
          )}
          <button
            onClick={() => setCreatingOpen(true)}
            className="rounded-field bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + لوحة جديدة
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        {isLoading && <p className="text-muted">جارٍ تحميل اللوحات...</p>}
        {!isLoading && boards?.length === 0 && (
          <p className="text-muted">لا توجد لوحات بعد — أنشئ واحدة من الأعلى.</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards?.map((board) => (
            <BoardCard key={board.id} board={board} isOwner={board.ownerId === user?.id} />
          ))}
        </div>
      </main>

      {creatingOpen && (
        <CreateBoardModal
          creating={createBoard.isPending}
          onClose={() => setCreatingOpen(false)}
          onCreate={(input) => createBoard.mutate(input)}
        />
      )}
    </div>
  );
}
