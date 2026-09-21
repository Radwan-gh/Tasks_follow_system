import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { useAuth } from "../features/auth/AuthContext";
import { isOverdueItem } from "../features/my-tasks/group-my-tasks";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/boards", label: "اللوحات", icon: "▤" },
  { to: "/my-tasks", label: "مهامي", icon: "◔" },
  { to: "/reports", label: "التقارير", icon: "◫", adminOnly: true },
  { to: "/admin/users", label: "المستخدمون", icon: "◎", adminOnly: true },
];

const BOARD_DOT_COLORS = ["bg-accent", "bg-line", "bg-line", "bg-line", "bg-line"];

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const { data: boards } = useQuery({ queryKey: ["boards"], queryFn: api.boards.list });
  const { data: archivedBoards } = useQuery({ queryKey: ["boards", "archived"], queryFn: api.boards.listArchived });
  // Polling (no realtime gateway exists yet) — an overdue count, not the
  // bell's unread-notification count, so the two badges stay non-redundant.
  const { data: myTasks } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: api.myTasks.list,
    refetchInterval: 60_000,
  });
  const overdueCount = myTasks?.items.filter((item) => isOverdueItem(item)).length ?? 0;

  return (
    <aside className="flex w-[232px] shrink-0 flex-col gap-[22px] border-line bg-surface p-4 [border-inline-start-width:1px] [border-inline-start-style:solid]">
      <div className="flex items-center justify-between gap-2.5 px-1.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-accent text-[15px] font-bold text-white">
            ◈
          </span>
          <span className="truncate text-[15px] font-bold text-ink">متابعة المهام</span>
        </div>
        <NotificationBell />
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "ADMIN").map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-field px-3.5 text-sm ${
                active ? "bg-accent-soft font-semibold text-accent" : "text-ink/80 hover:bg-canvas"
              }`}
            >
              <span aria-hidden className={active ? "text-accent" : "text-muted"}>
                {item.icon}
              </span>
              {item.label}
              {item.to === "/my-tasks" && overdueCount > 0 && (
                <span className="ms-auto rounded-full bg-alert-bg px-2 py-0.5 text-[11px] font-semibold text-alert">
                  {overdueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {boards && boards.length > 0 && (
        <div className="flex flex-col gap-2 px-1.5">
          <span className="text-[11px] font-bold text-muted">لوحاتي</span>
          <div className="flex flex-col gap-0.5">
            {boards.slice(0, 5).map((board, i) => (
              <Link
                key={board.id}
                to={`/boards/${board.id}`}
                className="flex min-h-10 items-center gap-2 truncate text-[13px] text-ink/80 hover:text-ink"
              >
                <span aria-hidden className={`h-[7px] w-[7px] shrink-0 rounded-full ${BOARD_DOT_COLORS[i] ?? "bg-line"}`} />
                <span className="truncate">{board.name}</span>
              </Link>
            ))}
          </div>
          {archivedBoards && archivedBoards.length > 0 && (
            <Link to="/boards/archived" className="flex min-h-8 items-center gap-2 text-xs text-muted hover:text-ink">
              <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-line" />
              المؤرشفة ({archivedBoards.length})
            </Link>
          )}
        </div>
      )}

      <UserMenu />
    </aside>
  );
}
