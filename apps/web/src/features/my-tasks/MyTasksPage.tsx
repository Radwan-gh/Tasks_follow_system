import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { MyTaskItem } from "@app/types";
import { api } from "../../lib/api-client";
import { useAuth } from "../auth/AuthContext";
import { statusDotClass } from "../boards/lib/status-colors";
import { groupMyTasks, isOverdueItem, type MyTasksBoardGroup } from "./group-my-tasks";
import { anyBoardOpen, summarizeFoldedGroup, toggleAllBoards, toggleFoldedBoard } from "./my-tasks-folds";
import { useFoldedBoards } from "./use-folded-boards";

/**
 * «مهامي»: overdue first, then everything else grouped by board. Each board
 * group folds to a short summary («مهامي — طيّ اللوحات» in the design), and
 * the folds are remembered per user in this browser. «متأخّرة» never folds,
 * so overdue work stays in view.
 */
export function MyTasksPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["my-tasks"], queryFn: api.myTasks.list });
  const grouped = data ? groupMyTasks(data.items) : null;
  const isEmpty = grouped && grouped.overdue.length === 0 && grouped.byBoard.length === 0;
  const [folded, setFolded] = useFoldedBoards(user?.id);
  const liveBoardIds = grouped?.byBoard.map((group) => group.boardId) ?? [];
  const anyOpen = anyBoardOpen(folded, liveBoardIds);

  function openItem(item: MyTaskItem) {
    navigate(`/boards/${item.boardId}?card=${item.cardId}`);
  }

  return (
    <div className="min-h-full bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-ink">مهامي</h1>
        {liveBoardIds.length > 0 && (
          <button
            onClick={() => setFolded(toggleAllBoards(folded, liveBoardIds))}
            className="inline-flex min-h-11 items-center gap-2 rounded-field border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-canvas"
          >
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      <main className="mx-auto max-w-2xl space-y-6 p-6">
        {isLoading && <p className="text-muted">جارٍ التحميل...</p>}
        {isEmpty && <p className="text-muted">لا توجد مهام مُسنَدة إليك حاليًا.</p>}

        {grouped && grouped.overdue.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold text-alert">متأخّرة</h2>
            <ul className="space-y-2">
              {grouped.overdue.map((item) => (
                <TaskRow key={item.id} item={item} onOpen={() => openItem(item)} />
              ))}
            </ul>
          </section>
        )}

        {grouped?.byBoard.map((group) => {
          const open = !folded.has(group.boardId);
          const toggle = () => setFolded(toggleFoldedBoard(folded, group.boardId, liveBoardIds));
          return (
            <section key={group.boardId} className="space-y-2">
              <h2>
                <button
                  onClick={toggle}
                  aria-expanded={open}
                  className="group flex min-h-11 w-full items-center gap-2.5 px-1 text-start"
                >
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-line text-ink group-hover:text-accent"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      {/* Down when open; folded, it points along the reading direction (left, in RTL). */}
                      <path d={open ? "M6 9l6 6 6-6" : "M15 6l-6 6 6 6"} />
                    </svg>
                  </span>
                  <span className="truncate text-sm font-bold text-ink">{group.boardName}</span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <span className="text-xs font-semibold text-muted">{group.items.length}</span>
                </button>
              </h2>
              {open ? (
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <TaskRow key={item.id} item={item} onOpen={() => openItem(item)} />
                  ))}
                </ul>
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
          <span key={item.id} className={`flex-1 rounded-full ${statusDotClass(item.statusCategory ?? null)}`} />
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink">
        <span className="font-semibold">{tasksLabel(group.items.length)}</span>
        {urgentCount > 0 && (
          <span className="rounded-full bg-urgent-bg px-2 font-bold text-urgent">{urgentCount} عاجلة</span>
        )}
        {nextDueDate && (
          <span className="text-muted">
            · أقرب موعد {new Date(nextDueDate).toLocaleDateString("ar", { day: "numeric", month: "long" })}
          </span>
        )}
        <span className="ms-auto font-semibold text-accent">عرض المهام</span>
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

function TaskRow({ item, onOpen }: { item: MyTaskItem; onOpen: () => void }) {
  const overdue = isOverdueItem(item);
  return (
    <li>
      <button
        onClick={onOpen}
        className="relative block w-full overflow-hidden rounded-card border border-line bg-surface p-3.5 text-start shadow-sm hover:shadow-md"
      >
        {item.priority === "URGENT" && <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-urgent" />}
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <span>{item.title}</span>
        </div>
        {item.kind === "SUBTASK" && item.parentCardTitle && (
          <p className="mt-0.5 text-xs text-muted">ضمن: {item.parentCardTitle}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-muted">{item.listName}</span>
          {item.dueDate && (
            <span className={overdue ? "font-semibold text-alert" : "text-muted"}>
              ◷ {new Date(item.dueDate).toLocaleDateString("ar", { dateStyle: "medium" })}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
