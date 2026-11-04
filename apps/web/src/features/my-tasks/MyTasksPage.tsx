import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MyTaskItem } from "@app/types";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { statusDotClass } from "../boards/lib/status-colors";
import { groupMyTasks, isOverdueItem, overdueLabel, type MyTasksBoardGroup } from "./group-my-tasks";
import { anyBoardOpen, summarizeFoldedGroup, toggleAllBoards, toggleFoldedBoard } from "./my-tasks-folds";
import { useFoldedBoards } from "./use-folded-boards";

/**
 * «مهامي»: overdue first, then everything else grouped by board — screens
 * 9/9b of `Tasks Mobile Redesign.dc.html`, which on desktop keeps the same
 * components with a text toggle-all button. Each board group folds to a short
 * summary, remembered per user in this browser. «متأخّرة» never folds, so
 * overdue work stays in view.
 */
export function MyTasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: api.myTasks.list,
  });
  const grouped = data ? groupMyTasks(data.items) : null;
  const isEmpty = grouped && grouped.overdue.length === 0 && grouped.byBoard.length === 0;
  const [folded, setFolded] = useFoldedBoards(user?.id);
  const liveBoardIds = grouped?.byBoard.map((group) => group.boardId) ?? [];
  const anyOpen = anyBoardOpen(folded, liveBoardIds);

  // The row's ← (a card to its board's next status) and tick box (a subtask
  // done). A ticked subtask and a card moved into «منجز» leave the list, so
  // refetch rather than guess.
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const rowAction = useMutation({
    mutationFn: async (item: MyTaskItem) => {
      if (item.kind === "SUBTASK") await api.subtasks.update(item.id, { isDone: true });
      else await api.cards.update(item.cardId, { targetListId: item.nextListId! });
    },
    onMutate: (item) => {
      setError(null);
      setBusyRows((rows) => new Set(rows).add(rowKey(item)));
    },
    onError: (_e, item) =>
      setError(
        item.kind === "SUBTASK" ? "تعذّر إنجاز المهمة الفرعية. أعد المحاولة." : "تعذّر نقل المهمة. أعد المحاولة.",
      ),
    onSettled: async (_d, _e, item) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["board", item.boardId] }),
        queryClient.invalidateQueries({ queryKey: ["card", item.cardId] }),
      ]);
      setBusyRows((rows) => {
        const next = new Set(rows);
        next.delete(rowKey(item));
        return next;
      });
    },
  });

  function renderRow(item: MyTaskItem) {
    return (
      <TaskRow
        key={rowKey(item)}
        item={item}
        busy={busyRows.has(rowKey(item))}
        onOpen={() => navigate(`/boards/${item.boardId}?card=${item.cardId}`)}
        onMoveNext={item.kind === "CARD" && item.nextListId ? () => rowAction.mutate(item) : undefined}
        onTick={item.kind === "SUBTASK" ? () => rowAction.mutate(item) : undefined}
      />
    );
  }

  return (
    <div className="min-h-full bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-6 py-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold text-ink">مهامي</h1>
          {data && data.items.length > 0 && (
            <p className="text-xs text-muted">
              {openLabel(data.items.length)}
              {grouped && grouped.overdue.length > 0 ? ` · ${grouped.overdue.length} متأخّرة` : ""}
            </p>
          )}
        </div>
        {liveBoardIds.length > 0 && (
          <button
            onClick={() => setFolded(toggleAllBoards(folded, liveBoardIds))}
            className="inline-flex min-h-11 items-center gap-2 rounded-field border border-line bg-surface px-4 text-sm font-semibold text-slate hover:bg-canvas"
          >
            <svg
              aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {anyOpen ? (
                <>
                  <path d="M7 20l5-5 5 5" />
                  <path d="M7 4l5 5 5-5" />
                </>
              ) : (
                <>
                  <path d="M7 15l5 5 5-5" />
                  <path d="M7 9l5-5 5 5" />
                </>
              )}
            </svg>
            {anyOpen ? "طيّ كل اللوحات" : "فتح كل اللوحات"}
          </button>
        )}
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
        {isLoading && <p className="text-muted">جارٍ التحميل...</p>}
        {isEmpty && <p className="text-muted">لا توجد مهام مُسنَدة إليك حاليًا.</p>}
        {error && (
          <p role="alert" className="rounded-field bg-alert-bg px-4 py-2 text-sm font-semibold text-alert">
            {error}
          </p>
        )}

        {grouped && grouped.overdue.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-2 px-1">
              <span aria-hidden className="h-2 w-2 rounded-full bg-alert" />
              <span className="text-[13px] font-bold text-alert">متأخّرة</span>
              <span className="text-xs text-alert-muted">{grouped.overdue.length}</span>
              {grouped.byBoard.length > 0 && (
                <span className="ms-auto text-[11px] font-normal text-faint">لا تُطوى</span>
              )}
            </h2>
            <ul className="flex flex-col gap-2.5">{grouped.overdue.map(renderRow)}</ul>
          </section>
        )}

        {grouped?.byBoard.map((group) => {
          const open = !folded.has(group.boardId);
          const toggle = () => setFolded(toggleFoldedBoard(folded, group.boardId, liveBoardIds));
          return (
            <section key={group.boardId} className="flex flex-col gap-2.5">
              <h2>
                <button
                  onClick={toggle}
                  aria-expanded={open}
                  className="group flex min-h-11 w-full items-center gap-2 px-1 text-start"
                >
                  <span
                    aria-hidden
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] bg-line text-ink group-hover:text-accent"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {/* Down when open; folded, it points along the reading direction (left, in RTL). */}
                      <path d={open ? "M6 9l6 6 6-6" : "M15 6l-6 6 6 6"} />
                    </svg>
                  </span>
                  <span className="truncate text-[13px] font-bold text-ink">{group.boardName}</span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <span className="text-xs font-semibold text-muted">{group.items.length}</span>
                </button>
              </h2>
              {open ? (
                <ul className="flex flex-col gap-2.5">{group.items.map(renderRow)}</ul>
              ) : (
                <FoldedSummary group={group} onOpen={toggle} />
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}

const rowKey = (item: MyTaskItem) => `${item.kind}-${item.id}`;

/** «15 مهمة مفتوحة» · «مهمتان مفتوحتان» · «مهمة واحدة مفتوحة». */
function openLabel(n: number): string {
  return n === 2 ? "مهمتان مفتوحتان" : `${tasksLabel(n)} مفتوحة`;
}

/**
 * What a folded board shows instead of its rows: one segment per task in its
 * status colour, then «n مهام · m عاجلة · أقرب موعد …». Clicking it unfolds.
 */
function FoldedSummary({ group, onOpen }: { group: MyTasksBoardGroup; onOpen: () => void }) {
  const { urgentCount, nextDueDate } = summarizeFoldedGroup(group.items);
  return (
    <button
      onClick={onOpen}
      aria-label={`عرض مهام ${group.boardName}`}
      className="flex w-full flex-col gap-2.5 rounded-field border-[1.5px] border-dashed border-line px-4 py-3.5 text-start hover:bg-surface"
    >
      <span aria-hidden className="flex h-1.5 w-full gap-[3px]">
        {group.items.map((item) => (
          // `?? null`: an API from before the field existed sends nothing at all.
          <span key={rowKey(item)} className={`flex-1 rounded-full ${statusDotClass(item.statusCategory ?? null)}`} />
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink">
        <span className="font-semibold">{tasksLabel(group.items.length)}</span>
        {urgentCount > 0 && (
          <span className="rounded-full bg-urgent-bg px-2 font-bold text-urgent">{urgentCount} عاجلة</span>
        )}
        {nextDueDate && <span className="text-muted">· أقرب موعد {formatDay(nextDueDate)}</span>}
      </span>
    </button>
  );
}

/** «مهمة واحدة» · «مهمتان» · «3 مهام» · «11 مهمة» — Arabic takes the plural only for 3–10. */
function tasksLabel(n: number): string {
  if (n === 1) return "مهمة واحدة";
  if (n === 2) return "مهمتان";
  const lastTwo = n % 100;
  return `${n} ${lastTwo >= 3 && lastTwo <= 10 ? "مهام" : "مهمة"}`;
}

/** «19 مايو» — the due chip's wording, no year. */
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", {
    day: "numeric",
    month: "long",
  });
}

/**
 * One row, as screens 9/9b draw it: a subtask leads with a tick box and
 * «ضمن: <its card>»; an overdue row is red-bordered with «◷ متأخّرة N أيام»
 * and the board's name; otherwise a card shows its status chip, «☑ done/total»
 * and due chip, a subtask just its (card's) due chip. A card has the ← arrow
 * to its board's next status; «عاجل» is the 3px stripe on the start edge.
 */
function TaskRow({
  item,
  busy,
  onOpen,
  onMoveNext,
  onTick,
}: {
  item: MyTaskItem;
  busy: boolean;
  onOpen: () => void;
  onMoveNext?: () => void;
  onTick?: () => void;
}) {
  const overdue = isOverdueItem(item);
  const isSubtask = item.kind === "SUBTASK";
  const statusChip =
    item.statusCategory === "IN_PROGRESS" ? "bg-avatar-amberBg text-avatar-amberFg" : "bg-slate-soft text-slate";
  const chip = "rounded-full px-2.5 py-[5px] text-xs";

  return (
    <li
      className={`relative flex flex-col gap-3 overflow-hidden rounded-card border bg-surface p-4 ${
        overdue ? "border-alert-line" : "border-line"
      } ${busy ? "opacity-60" : ""}`}
    >
      {item.priority === "URGENT" && <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-urgent" />}
      {/* The row's open target sits under its own controls, so ← and the tick box stay separate buttons. */}
      <button
        onClick={onOpen}
        disabled={busy}
        aria-label={`فتح «${item.title}»`}
        className="absolute inset-0 hover:bg-ink/[0.02]"
      />

      {isSubtask ? (
        <div className="pointer-events-none relative flex items-start gap-2">
          <button
            role="checkbox"
            aria-checked={busy}
            aria-label={`إنجاز «${item.title}»`}
            disabled={busy || !onTick}
            onClick={onTick}
            className={`pointer-events-auto mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] text-xs text-surface ${
              busy ? "border-accent bg-accent" : "border-line-strong hover:border-accent"
            }`}
          >
            {busy ? "✓" : null}
          </button>
          <div className="flex flex-col gap-[3px]">
            <span className="text-[15px] font-semibold leading-relaxed text-ink">{item.title}</span>
            <span className="text-xs text-faint">ضمن: {item.parentCardTitle}</span>
          </div>
        </div>
      ) : (
        <span className="pointer-events-none relative text-[15px] font-semibold leading-relaxed text-ink">
          {item.title}
        </span>
      )}

      {(!isSubtask || item.dueDate) && (
        <div className="pointer-events-none relative flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {overdue && item.dueDate ? (
              <>
                <span className={`${chip} bg-alert-bg font-semibold text-alert`}>◷ {overdueLabel(item.dueDate)}</span>
                <span className="text-xs text-muted">{item.boardName}</span>
              </>
            ) : (
              <>
                {!isSubtask && (
                  <span className={`${chip} inline-flex items-center gap-[5px] ${statusChip}`}>
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${statusDotClass(item.statusCategory ?? null)}`}
                    />
                    {item.listName}
                  </span>
                )}
                {!isSubtask && item.subtaskTotal > 0 && (
                  <span
                    className="text-xs text-muted"
                    aria-label={`أُنجزت ${item.subtaskDone} من ${item.subtaskTotal} مهام فرعية`}
                  >
                    ☑ <bdi>{`${item.subtaskDone}/${item.subtaskTotal}`}</bdi>
                  </span>
                )}
                {item.dueDate && <span className={`${chip} bg-chip text-muted`}>◷ {formatDay(item.dueDate)}</span>}
              </>
            )}
          </div>
          {onMoveNext && (
            <button
              onClick={onMoveNext}
              disabled={busy}
              aria-label="نقل إلى الحالة التالية"
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-base text-accent hover:bg-accent hover:text-surface"
            >
              ←
            </button>
          )}
        </div>
      )}
    </li>
  );
}
