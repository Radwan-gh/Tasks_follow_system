import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BoardMember } from "@app/types";
import { api, ApiError } from "../../../lib/api-client";

interface BoardMembersModalProps {
  boardId: string;
  members: BoardMember[];
  onClose: () => void;
}

export function BoardMembersModal({ boardId, members, onClose }: BoardMembersModalProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["board", boardId] });
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Something went wrong");

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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    addMember.mutate(email.trim());
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Board members</h2>
          <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
            Close
          </button>
        </div>

        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Add member by email"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={addMember.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-slate-900">{m.user.displayName}</span>
                <span className="ml-2 text-slate-500">{m.user.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    m.role === "OWNER"
                      ? "rounded bg-slate-900 px-2 py-0.5 text-xs font-medium text-white"
                      : "rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                  }
                >
                  {m.role}
                </span>
                {m.role !== "OWNER" && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove ${m.user.email} from this board?`)) removeMember.mutate(m.userId);
                    }}
                    disabled={removeMember.isPending}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
