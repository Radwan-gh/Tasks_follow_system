import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardCategory } from "@app/types";
import { ApiError } from "@app/api-client";
import { api } from "../../../lib/api-client";
import { useAuth } from "../../auth/AuthContext";
import { canManageBoardCategories, categoryMoveFor } from "../lib/board-sections";

export const BOARD_CATEGORIES_KEY = ["board-categories"] as const;

export function useBoardCategories() {
  return useQuery({ queryKey: BOARD_CATEGORIES_KEY, queryFn: api.boardCategories.list });
}

/**
 * One step up or down, applied to the cached order at once and sent as a
 * neighbour-id move. Mirrors mobile's `useMoveBoardCategory`.
 */
export function useMoveBoardCategory() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, move }: { id: string; move: { beforeId: string | null; afterId: string | null } }) =>
      api.boardCategories.update(id, { move }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: BOARD_CATEGORIES_KEY }),
  });

  return (id: string, direction: "up" | "down") => {
    const current = queryClient.getQueryData<BoardCategory[]>(BOARD_CATEGORIES_KEY);
    if (!current) return;
    const move = categoryMoveFor(
      current.map((c) => c.id),
      id,
      direction,
    );
    if (!move) return;
    const from = current.findIndex((c) => c.id === id);
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(direction === "up" ? from - 1 : from + 1, 0, moved!);
    queryClient.setQueryData(BOARD_CATEGORIES_KEY, next);
    mutation.mutate({ id, move });
  };
}

export function categoryErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) return "يوجد تصنيف بهذا الاسم.";
  if (err instanceof ApiError && err.status === 403) return "إدارة التصنيفات للمشرف فقط.";
  return "تعذّر حفظ التصنيف.";
}

/**
 * «التصنيف» field of the create-board and board-settings modals: «بلا تصنيف»
 * or an existing category, plus — for admins — «+ تصنيف جديد», which creates
 * one in place and selects it. Mirrors mobile's `CategoryField`.
 */
export function CategorySelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canCreate = !!user && canManageBoardCategories(user);
  const { data: categories } = useBoardCategories();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (newName: string) => api.boardCategories.create({ name: newName }),
    onSuccess: (category) => {
      queryClient.setQueryData<BoardCategory[]>(BOARD_CATEGORIES_KEY, (old) =>
        // The server puts a new category last.
        old ? [...old, category] : [category],
      );
      onChange(category.id);
      setAdding(false);
      setName("");
    },
    onError: (err) => setError(categoryErrorMessage(err)),
  });

  function submitNew() {
    const trimmed = name.trim();
    if (trimmed && !create.isPending) create.mutate(trimmed);
  }

  // Nothing to pick and no way to add one: only an admin creates categories.
  if (categories?.length === 0 && !value && !canCreate) return null;

  return (
    <div className="space-y-1">
      <span className="block text-sm text-ink/70">التصنيف (اختياري)</span>
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            // Inside a <form>: Enter must create the category, not submit the board.
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNew();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setAdding(false);
              }
            }}
            placeholder="اسم التصنيف، مثل: الجامع"
            className="min-w-0 flex-1 rounded-field border border-line px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={submitNew}
            disabled={!name.trim() || create.isPending}
            className="rounded-field bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            إضافة
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-field px-2 py-2 text-sm text-ink/70 hover:bg-canvas"
          >
            إلغاء
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="min-w-0 flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">بلا تصنيف</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="shrink-0 rounded-field px-3 py-2 text-sm font-medium text-accent hover:bg-accent-soft"
            >
              + تصنيف جديد
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
