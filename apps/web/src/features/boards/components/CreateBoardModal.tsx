import { useState, type FormEvent } from "react";
import type { BoardKind, CreateBoardRequest } from "@app/types";
import { canApproveSharedBoards } from "../../../lib/can-approve-boards";
import { useAuth } from "../../auth/AuthContext";
import { CategorySelect } from "./CategorySelect";
import { SimilarBoardsPanel } from "./SimilarBoardsPanel";

interface CreateBoardModalProps {
  onClose: () => void;
  onCreate: (input: CreateBoardRequest) => void;
  creating: boolean;
}

/**
 * Name + kind + description + optional category and due date. New boards
 * always start with the five status lists (server default). A shared board
 * needs its scope and — unless the creator is an approver — files a share
 * request (`docs/18-board-sharing.md`), so similar boards are shown first.
 */
export function CreateBoardModal({ onClose, onCreate, creating }: CreateBoardModalProps) {
  const { user } = useAuth();
  const approver = !!user && canApproveSharedBoards(user);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BoardKind>("PERSONAL");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const shared = kind === "SHARED";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || (shared && !description.trim())) return;
    onCreate({
      name: name.trim(),
      kind,
      description: description.trim() || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      categoryId,
    });
  }

  const kinds: { value: BoardKind; label: string; helper: string }[] = [
    { value: "PERSONAL", label: "لوحة شخصية", helper: "لك وحدك، بلا أعضاء." },
    {
      value: "SHARED",
      label: "لوحة مشتركة",
      helper: approver
        ? "يشترك فيها آخرون، وتُنشأ مشتركة مباشرة."
        : "يشترك فيها آخرون، وتحتاج موافقة قبل إضافة الأعضاء.",
    },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90vh] w-full space-y-3 overflow-y-auto rounded-card bg-surface p-6 shadow-xl ${
          shared ? "max-w-md" : "max-w-sm"
        }`}
      >
        <h2 className="text-lg font-semibold text-ink">لوحة جديدة</h2>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">اسم اللوحة</span>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="sr-only">نوع اللوحة</legend>
          <div className="grid grid-cols-2 gap-1 rounded-field bg-canvas p-1">
            {kinds.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-[38px] cursor-pointer items-center justify-center rounded-[12px] text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                  kind === option.value ? "bg-surface font-semibold text-ink shadow-sm" : "text-ink/60 hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="board-kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">{kinds.find((o) => o.value === kind)!.helper}</p>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">{shared ? "نطاق اللوحة" : "الوصف (اختياري)"}</span>
          <textarea
            required={shared}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={shared ? 3 : 2}
            placeholder={shared ? "ما الذي تتابعه هذه اللوحة، ولمن؟" : undefined}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        {shared && <SimilarBoardsPanel name={name} />}

        <CategorySelect value={categoryId} onChange={setCategoryId} />

        <label className="block space-y-1">
          <span className="text-sm text-ink/70">موعد التسليم (اختياري)</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-field border border-line px-3 py-2 text-sm"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-field px-3 py-1.5 text-sm text-ink/70 hover:bg-canvas">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={creating}
            className="rounded-field bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "جارٍ الإنشاء..." : shared && !approver ? "إنشاء اللوحة وإرسال الطلب" : "إنشاء اللوحة"}
          </button>
        </div>
      </form>
    </div>
  );
}
