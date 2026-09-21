import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { BoardCard } from "./components/BoardCard";

export function ArchivedBoardsPage() {
  const { user } = useAuth();
  const { data: boards, isLoading } = useQuery({ queryKey: ["boards", "archived"], queryFn: api.boards.listArchived });

  return (
    <div className="min-h-full bg-canvas">
      <header className="flex items-center gap-4 border-b border-line bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-ink">اللوحات المؤرشفة</h1>
        <Link to="/boards" className="text-sm text-muted hover:text-ink">
          → اللوحات
        </Link>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        {isLoading && <p className="text-muted">جارٍ التحميل...</p>}
        {!isLoading && boards?.length === 0 && <p className="text-muted">لا توجد لوحات مؤرشفة.</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards?.map((board) => (
            <BoardCard key={board.id} board={board} isOwner={board.ownerId === user?.id} />
          ))}
        </div>
      </main>
    </div>
  );
}
