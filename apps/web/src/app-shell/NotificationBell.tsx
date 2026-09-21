import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@app/types";
import { api } from "../lib/api-client";
import { describeNotification } from "../lib/describe-notification";
import { useDismissableLayer } from "../lib/use-dismissable-layer";

/** Calendar-day bucket for grouping, not a rolling 24h window. */
function dayLabel(iso: string): "اليوم" | "أمس" | "أقدم" {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return "اليوم";
  if (diffDays === 1) return "أمس";
  return "أقدم";
}

/** Bell + badge in the sidebar header, opening a popover of recent notifications. No realtime gateway exists — polled. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.notifications.list,
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useDismissableLayer(ref, open, () => setOpen(false));

  const unreadCount = data?.unreadCount ?? 0;
  const groups: Record<"اليوم" | "أمس" | "أقدم", Notification[]> = { اليوم: [], أمس: [], أقدم: [] };
  for (const item of data?.items ?? []) groups[dayLabel(item.createdAt)].push(item);

  function openNotification(item: Notification) {
    if (!item.readAt) markRead.mutate(item.id);
    setOpen(false);
    if (item.boardId && item.cardId) navigate(`/boards/${item.boardId}?card=${item.cardId}`);
    else if (item.boardId) navigate(`/boards/${item.boardId}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-field border border-line bg-canvas text-sm text-ink/70 hover:bg-line/40"
        title="الإشعارات"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -start-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-surface bg-accent px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full z-30 mt-2 w-[344px] overflow-hidden rounded-card border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold text-ink">الإشعارات</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs font-semibold text-accent hover:underline"
              >
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {(["اليوم", "أمس", "أقدم"] as const).map(
              (label) =>
                groups[label].length > 0 && (
                  <div key={label}>
                    <div className="bg-canvas px-4 py-1.5 text-xs font-bold text-muted">{label}</div>
                    {groups[label].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openNotification(item)}
                        className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-start last:border-b-0 hover:bg-canvas"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-relaxed text-ink">
                            {describeNotification({ type: item.type, payload: item.payload })}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {new Date(item.createdAt).toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                        {!item.readAt && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      </button>
                    ))}
                  </div>
                ),
            )}
            {(data?.items.length ?? 0) === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">لا توجد إشعارات بعد.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
