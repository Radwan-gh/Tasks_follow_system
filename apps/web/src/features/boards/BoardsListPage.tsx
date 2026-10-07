import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBoardRequest } from "@app/types";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { BoardCard } from "./components/BoardCard";
import {
  BOARD_CATEGORIES_KEY,
  categoryErrorMessage,
  useBoardCategories,
  useMoveBoardCategory,
} from "./components/CategorySelect";
import { CreateBoardModal } from "./components/CreateBoardModal";
import { canManageBoardCategories, groupBoardsByCategory } from "./lib/board-sections";

export function BoardsListPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: boards, isLoading } = useQuery({ queryKey: ["boards"], queryFn: api.boards.list });
  const { data: categories } = useBoardCategories();
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const moveCategory = useMoveBoardCategory();

  const createBoard = useMutation({
    mutationFn: (input: CreateBoardRequest) => api.boards.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] });
      setCreatingOpen(false);
    },
  });

  // Category management is admin-only; admins also see empty categories.
  const isCategoryAdmin = !!user && canManageBoardCategories(user);
  const sections = useMemo(
    () => (boards ? groupBoardsByCategory(boards, categories ?? [], { includeEmpty: isCategoryAdmin }) : []),
    [boards, categories, isCategoryAdmin],
  );
  const grouped = sections.some((s) => s.category !== null);

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const grid = (list: NonNullable<typeof boards>) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((board) => (
        <BoardCard key={board.id} board={board} isOwner={board.ownerId === user?.id} />
      ))}
    </div>
  );

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

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        {isLoading && <p className="text-muted">جارٍ تحميل اللوحات...</p>}
        {!isLoading && boards?.length === 0 && (
          <p className="text-muted">لا توجد لوحات بعد — أنشئ واحدة من الأعلى.</p>
        )}

        {grouped
          ? sections.map((section) => {
              const key = section.category?.id ?? "NONE";
              const open = !collapsed.has(key);
              // Admins see every category as a section, so this is the full order.
              const index = categories?.findIndex((c) => c.id === section.category?.id) ?? -1;
              return (
                <section key={key} className="space-y-3">
                  <CategoryHeader
                    category={section.category}
                    count={section.boards.length}
                    open={open}
                    onToggle={() => toggle(key)}
                    manageable={!!section.category && isCategoryAdmin}
                    onMove={(direction) => section.category && moveCategory(section.category.id, direction)}
                    canMoveUp={index > 0}
                    canMoveDown={index >= 0 && index < (categories?.length ?? 0) - 1}
                  />
                  {open &&
                    (section.boards.length > 0 ? (
                      grid(section.boards)
                    ) : (
                      <p className="text-sm text-muted">
                        لا لوحات فيه بعد. اختره من «التصنيف» عند إنشاء لوحة أو في إعداداتها.
                      </p>
                    ))}
                </section>
              );
            })
          : boards && grid(boards)}

        {!isLoading && isCategoryAdmin && <NewCategoryButton />}
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

/** A section heading: fold/unfold, and — for admins — move up/down, rename or delete in place. */
function CategoryHeader({
  category,
  count,
  open,
  onToggle,
  manageable,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  category: { id: string; name: string } | null;
  count: number;
  open: boolean;
  onToggle: () => void;
  manageable: boolean;
  onMove: (direction: "up" | "down") => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"idle" | "renaming" | "deleting">("idle");
  const [name, setName] = useState(category?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: BOARD_CATEGORIES_KEY });
    queryClient.invalidateQueries({ queryKey: ["boards"] });
  }

  const rename = useMutation({
    mutationFn: (newName: string) => api.boardCategories.update(category!.id, { name: newName }),
    onSuccess: () => {
      setMode("idle");
      refresh();
    },
    onError: (err) => setError(categoryErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.boardCategories.remove(category!.id),
    onSuccess: refresh,
    onError: (err) => setError(categoryErrorMessage(err)),
  });

  if (mode === "renaming" && category) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) rename.mutate(name.trim());
        }}
      >
        <input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="rounded-field border border-line px-3 py-1.5 text-sm"
        />
        <button type="submit" disabled={rename.isPending} className="text-sm font-medium text-accent disabled:opacity-50">
          حفظ الاسم
        </button>
        <button type="button" onClick={() => setMode("idle")} className="text-sm text-muted hover:text-ink">
          إلغاء
        </button>
        {error && <span className="text-xs text-alert">{error}</span>}
      </form>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-field py-1 text-start hover:text-ink"
        >
          <span className={`text-xs text-muted transition-transform ${open ? "" : "rotate-90"}`} aria-hidden>
            ▾
          </span>
          <h2 className="text-sm font-bold text-ink">{category?.name ?? "بلا تصنيف"}</h2>
          <span className="text-xs text-muted">{count}</span>
        </button>
        {manageable && mode === "idle" && (
          <span className="flex items-center gap-3 text-xs text-muted">
            <span className="flex">
              <button
                type="button"
                onClick={() => onMove("up")}
                disabled={!canMoveUp}
                aria-label={`تحريك «${category?.name ?? ""}» لأعلى`}
                className="rounded px-1.5 py-0.5 hover:bg-line hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove("down")}
                disabled={!canMoveDown}
                aria-label={`تحريك «${category?.name ?? ""}» لأسفل`}
                className="rounded px-1.5 py-0.5 hover:bg-line hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
              >
                ↓
              </button>
            </span>
            <button type="button" onClick={() => setMode("renaming")} className="hover:text-ink">
              إعادة التسمية
            </button>
            <button type="button" onClick={() => setMode("deleting")} className="hover:text-alert">
              حذف
            </button>
          </span>
        )}
      </div>
      {mode === "deleting" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-ink/70">يُحذف التصنيف لدى الجميع، وتنتقل لوحاته إلى «بلا تصنيف».</span>
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="rounded-field bg-alert px-3 py-1 text-white disabled:opacity-50"
          >
            حذف التصنيف
          </button>
          <button type="button" onClick={() => setMode("idle")} className="text-muted hover:text-ink">
            الاحتفاظ به
          </button>
        </div>
      )}
      {error && mode !== "renaming" && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}

function NewCategoryButton() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (newName: string) => api.boardCategories.create({ name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BOARD_CATEGORIES_KEY });
      setOpen(false);
      setName("");
    },
    onError: (err) => setError(categoryErrorMessage(err)),
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-muted hover:text-ink">
        + تصنيف جديد
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate(name.trim());
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder="اسم التصنيف، مثل: الجامع"
        className="rounded-field border border-line px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={!name.trim() || create.isPending}
        className="rounded-field bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        إنشاء التصنيف
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
        إلغاء
      </button>
      {error && <span className="text-xs text-alert">{error}</span>}
    </form>
  );
}
