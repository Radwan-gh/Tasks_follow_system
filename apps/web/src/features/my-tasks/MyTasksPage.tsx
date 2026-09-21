import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { MyTaskItem } from "@app/types";
import { api } from "../../lib/api-client";
import { groupMyTasks, isOverdueItem } from "./group-my-tasks";

export function MyTasksPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["my-tasks"], queryFn: api.myTasks.list });
  const grouped = data ? groupMyTasks(data.items) : null;
  const isEmpty = grouped && grouped.overdue.length === 0 && grouped.byBoard.length === 0;

  function openItem(item: MyTaskItem) {
    navigate(`/boards/${item.boardId}?card=${item.cardId}`);
  }

  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-ink">مهامي</h1>
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

        {grouped?.byBoard.map((group) => (
          <section key={group.boardId} className="space-y-2">
            <h2 className="text-xs font-bold text-muted">{group.boardName}</h2>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <TaskRow key={item.id} item={item} onOpen={() => openItem(item)} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
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
