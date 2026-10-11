import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardBoardRef, CardBoardsResponse } from "@app/types";
import { api } from "../../../lib/api-client";
import { boardChips, boardInitial, pickBoards } from "../../../lib/card-boards";
import { useAutoSavedIds } from "../../../lib/use-auto-saved-ids";
import { useDismissableLayer } from "../../../lib/use-dismissable-layer";

const NO_IDS: string[] = [];

/**
 * «اللوحات» in the task panel (docs/18-multi-board-tasks.md), built like the
 * assignees field: the task's boards as chips, ✕ on each the user may take
 * off, and «+ إضافة لوحة» — for the task's owner or an admin — opening a small
 * popup with their three latest-used boards and a search for the rest. Every
 * add and remove saves at once. One task, one status: on a board it is added
 * to it shows in the column with the same status. Mirrors the mobile
 * `card-boards-field.tsx`.
 */
export function CardBoardsSection({
  cardId,
  readOnly,
  onSaved,
}: {
  cardId: string;
  readOnly: boolean;
  /** Every board touched, before and after the change, to refresh. */
  onSaved: (boardIds: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: ["cardBoards", cardId], queryFn: () => api.cards.boards(cardId) });
  const [open, setOpen] = useState(false);
  // Names of boards added from the popup, until the server's own list has them.
  const [addedNames, setAddedNames] = useState<ReadonlyMap<string, string>>(new Map());

  const serverIds = useMemo(() => boards.data?.boards.map((b) => b.id) ?? NO_IDS, [boards.data]);
  const selection = useAutoSavedIds(serverIds, async (boardIds) => {
    const before = queryClient.getQueryData<CardBoardsResponse>(["cardBoards", cardId])?.boards.map((b) => b.id) ?? [];
    const result = await api.cards.setBoards(cardId, { boardIds });
    queryClient.setQueryData(["cardBoards", cardId], result);
    // A removed board is on offer again, and "latest used" may have moved.
    void queryClient.invalidateQueries({ queryKey: ["cardBoardOptions", cardId] });
    onSaved([...new Set([...before, ...boardIds])]);
  });

  if (!boards.data) return null;
  const canChange = boards.data.canChange && !readOnly;
  const chips = boardChips(boards.data, selection.ids, addedNames);

  function add(board: CardBoardRef) {
    setAddedNames((names) => new Map(names).set(board.id, board.name));
    selection.change([...selection.ids, board.id]);
    setOpen(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">اللوحات</span>
        {selection.saving ? (
          <span className="text-[11px] text-muted">جارٍ الحفظ…</span>
        ) : selection.failed ? (
          <span role="alert" className="text-[11px] text-alert">
            تعذّر الحفظ، فأُعيدت اللوحات إلى آخر حالة محفوظة.
          </span>
        ) : null}
      </div>
      <div className="relative flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-soft py-0.5 pe-0.5 ps-1 text-xs text-ink"
          >
            <BoardBadge name={chip.name} />
            <span className="max-w-[10rem] truncate">{chip.name}</span>
            {canChange && chip.removable ? (
              <button
                type="button"
                onClick={() => selection.change(selection.ids.filter((id) => id !== chip.id))}
                aria-label={`إزالة المهمة من ${chip.name}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-alert focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span aria-hidden>✕</span>
              </button>
            ) : (
              <span aria-hidden className="w-1" />
            )}
          </span>
        ))}
        {canChange && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="rounded-full px-2 py-0.5 text-xs font-semibold text-accent hover:bg-accent-soft"
          >
            + إضافة لوحة
          </button>
        )}
        {open && (
          <AddBoardPopup cardId={cardId} excludeIds={selection.ids} onPick={add} onClose={() => setOpen(false)} />
        )}
      </div>
    </div>
  );
}

/** A board's badge: a rounded square, so boards never read as people's round avatars. */
function BoardBadge({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-md bg-surface font-semibold text-accent ${
        large ? "h-7 w-7 border border-line text-[11px]" : "h-5 w-5 text-[10px]"
      }`}
    >
      {boardInitial(name)}
    </span>
  );
}

/**
 * The user's three latest-used boards straight away, and a search over every
 * board they could add the task to. ↑/↓ and Enter pick; Escape or a click
 * outside closes only the popup, never the panel behind it. The boards are
 * read only when it opens.
 */
function AddBoardPopup({
  cardId,
  excludeIds,
  onPick,
  onClose,
}: {
  cardId: string;
  excludeIds: string[];
  onPick: (board: CardBoardRef) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const options = useQuery({ queryKey: ["cardBoardOptions", cardId], queryFn: () => api.cards.boardOptions(cardId) });
  const [term, setTerm] = useState("");
  const [highlight, setHighlight] = useState(0);
  useDismissableLayer(ref, true, onClose);

  const shown = pickBoards(options.data ?? [], excludeIds, term);
  const active = Math.min(highlight, Math.max(shown.length - 1, 0));
  const nothingToAdd = !!options.data && pickBoards(options.data, excludeIds, "").length === 0;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && shown.length > 0) {
      e.preventDefault();
      setHighlight(Math.min(active + 1, shown.length - 1));
    } else if (e.key === "ArrowUp" && shown.length > 0) {
      e.preventDefault();
      setHighlight(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) onPick(shown[active]);
    } else if (e.key === "Escape") {
      // Close the popup only — don't let this Escape also close the task panel.
      e.stopPropagation();
      onClose();
    }
  }

  let note: string | null = null;
  if (options.isPending) note = "جارٍ التحميل…";
  else if (options.isError) note = "تعذّر تحميل اللوحات.";
  else if (nothingToAdd) note = "لا توجد لوحات أخرى يمكنك إضافة المهمة إليها.";
  else if (shown.length === 0) note = `لا توجد لوحة تطابق «${term.trim()}».`;

  return (
    <div
      ref={ref}
      className="absolute inset-x-0 top-full z-20 mt-1 space-y-1 rounded-field border border-line bg-surface p-2 shadow-lg"
    >
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-label="ابحث عن لوحة"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={shown.length > 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="ابحث عن لوحة"
        className="w-full rounded-field border border-line bg-canvas px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {note ? (
        <p className="px-2 py-1 text-xs text-muted">{note}</p>
      ) : (
        <>
          {!term.trim() && <p className="px-2 pt-1 text-[11px] font-medium text-muted">آخر اللوحات المستخدمة</p>}
          <ul id={listId} role="listbox" aria-label="لوحات يمكن إضافة المهمة إليها">
            {shown.map((board, index) => (
              <li
                key={board.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => onPick(board)}
                className={`flex cursor-pointer items-center gap-2 rounded-[12px] px-2 py-1.5 text-sm text-ink ${
                  index === active ? "bg-canvas" : ""
                }`}
              >
                <BoardBadge name={board.name} large />
                <span className="min-w-0 flex-1 truncate">{board.name}</span>
                {index === active && (
                  <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] text-muted">
                    Enter
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
