import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  anyBoardOpen,
  summarizeFoldedGroup,
  toggleAllBoards,
  toggleFoldedBoard,
  type MyTaskItem,
} from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Toast, type ToastMessage } from "@/components/toast";
import { useAuth } from "@/features/auth/auth-context";
import { TaskRow } from "@/features/my-tasks/task-row";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { api } from "@/lib/api";
import { useOpenCard } from "@/lib/board-cache";
import { formatDueDate, isOverdue } from "@/lib/date";
import { loadFoldedBoards, saveFoldedBoards } from "@/lib/folded-boards";
import { TASKS, countLabel } from "@/lib/plural";
import { GUTTER, MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * `/my-tasks` — everything assigned to me (cards + subtasks), across every
 * board. Per `v2-new-style.md` §7.1: overdue first (its own section, any
 * board), then the rest grouped by board. Each board group folds to a short
 * summary («مهامي — طيّ اللوحات» in the design); «متأخّرة» never folds, so
 * overdue work stays in view.
 */
export default function MyTasksScreen() {
  const openCard = useOpenCard();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const myTasks = useQuery({ queryKey: ["my-tasks"], queryFn: () => api.myTasks.list() });
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // The row's ← (a card to its board's next status) and tick box (a subtask
  // done). Either way the row's data changed on the server — a ticked subtask
  // and a card moved into «منجز» leave the list — so refetch rather than guess.
  const [busyRows, setBusyRows] = useState<ReadonlySet<string>>(new Set());
  const rowAction = useMutation({
    mutationFn: async (item: MyTaskItem) => {
      if (item.kind === "SUBTASK") await api.subtasks.update(item.id, { isDone: true });
      else await api.cards.update(item.cardId, { targetListId: item.nextListId! });
    },
    onMutate: (item) => setBusyRows((rows) => new Set(rows).add(rowKey(item))),
    onError: (_error, item) =>
      setToast({
        id: Date.now(),
        message:
          item.kind === "SUBTASK"
            ? "تعذّر إنجاز المهمة الفرعية. أعد المحاولة."
            : "تعذّر نقل المهمة. تحقّق من الاتصال وأعد المحاولة.",
      }),
    onSettled: async (_data, _error, item) => {
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
        onOpen={() => openCard(item.cardId, item.boardId)}
        onMoveNext={item.kind === "CARD" && item.nextListId ? () => rowAction.mutate(item) : undefined}
        onTick={item.kind === "SUBTASK" ? () => rowAction.mutate(item) : undefined}
      />
    );
  }

  const overdue = sortByUrgency(myTasks.data?.items.filter((item) => item.dueDate && isOverdue(item.dueDate)) ?? []);
  const remaining = sortByUrgency(myTasks.data?.items.filter((item) => !(item.dueDate && isOverdue(item.dueDate))) ?? []);
  const boardGroups = groupByBoard(remaining);
  const liveBoardIds = boardGroups.map((group) => group.boardId);

  // Board ids this user folded — groups start open, and the choice is
  // remembered per user on this device.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const touchedFolds = useRef(false);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    touchedFolds.current = false;
    setFolded(new Set());
    let cancelled = false;
    void loadFoldedBoards(userId).then((saved) => {
      // A tap that landed before the read finished wins over the saved state.
      if (!cancelled && !touchedFolds.current) setFolded(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function applyFolds(next: Set<string>) {
    touchedFolds.current = true;
    setFolded(next);
    if (userId) saveFoldedBoards(userId, next);
  }

  const anyOpen = anyBoardOpen(folded, liveBoardIds);

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: GUTTER,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
      >
        <View style={{ gap: 2 }}>
          <AppText weight="bold" style={{ fontSize: 24, lineHeight: 36 }}>
            مهامي
          </AppText>
          {myTasks.data && myTasks.data.items.length > 0 ? (
            <AppText size="caption" color={colors.muted}>
              {openLabel(myTasks.data.items.length)}
              {overdue.length > 0 ? ` · ${overdue.length} متأخّرة` : ""}
            </AppText>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {boardGroups.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={anyOpen ? "طيّ كل اللوحات" : "فتح كل اللوحات"}
              onPress={() => applyFolds(toggleAllBoards(folded, liveBoardIds))}
              style={({ pressed }) => ({
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name={anyOpen ? "chevron-collapse-outline" : "chevron-expand-outline"} size={18} color={colors.slate} />
            </Pressable>
          ) : null}
          <NotificationBell />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: spacing.xxl, gap: spacing.xl }}>
        {myTasks.isPending ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={18} width="40%" />
            <Skeleton height={64} radius={18} />
            <Skeleton height={64} radius={18} />
          </View>
        ) : myTasks.isError ? (
          <ErrorState onRetry={() => void myTasks.refetch()} />
        ) : myTasks.data.items.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title="لا مهام مُسنَدة"
            message="تظهر هنا كل المهام والمهام الفرعية المُسنَدة إليك في أي لوحة."
          />
        ) : (
          <>
            {overdue.length > 0 ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs }}>
                  <View style={{ width: 8, height: 8, borderRadius: radii.chip, backgroundColor: colors.alert }} />
                  <AppText size="small" weight="bold" color={colors.alert}>
                    متأخّرة
                  </AppText>
                  <AppText size="caption" color={colors.alertMuted}>
                    {overdue.length}
                  </AppText>
                  {boardGroups.length > 0 ? (
                    <AppText color={colors.faint} style={{ marginStart: "auto", fontSize: 11, lineHeight: 18 }}>
                      لا تُطوى
                    </AppText>
                  ) : null}
                </View>
                {overdue.map(renderRow)}
              </View>
            ) : null}

            {boardGroups.map((group) => {
              const open = !folded.has(group.boardId);
              const toggle = () => applyFolds(toggleFoldedBoard(folded, group.boardId, liveBoardIds));
              return (
                <View key={group.boardId} style={{ gap: 10 }}>
                  <BoardGroupHeader name={group.boardName} count={group.items.length} open={open} onPress={toggle} />
                  {open ? (
                    group.items.map(renderRow)
                  ) : (
                    <FoldedSummary name={group.boardName} items={group.items} onPress={toggle} />
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View pointerEvents="box-none" style={{ position: "absolute", start: spacing.xl, end: spacing.xl, bottom: spacing.lg }}>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </View>
    </Screen>
  );
}

const rowKey = (item: MyTaskItem) => `${item.kind}-${item.id}`;

/** «15 مهمة مفتوحة» · «مهمتان مفتوحتان» · «مهمة واحدة مفتوحة». */
function openLabel(n: number): string {
  return n === 2 ? "مهمتان مفتوحتان" : `${countLabel(n, TASKS)} مفتوحة`;
}

/** A board group's heading — tap folds or unfolds it. */
function BoardGroupHeader({
  name,
  count,
  open,
  onPress,
}: {
  name: string;
  count: number;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${name}، ${countLabel(count, TASKS)}`}
      accessibilityHint="اضغط للطي أو الفتح"
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.xs }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 9,
          backgroundColor: colors.line,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={open ? "chevron-down" : "chevron-back"} size={14} color={colors.ink} />
      </View>
      <AppText size="small" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
        {name}
      </AppText>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <AppText size="caption" weight="semibold" color={colors.muted}>
        {count}
      </AppText>
    </Pressable>
  );
}

/**
 * What a folded board shows instead of its rows: one segment per task in its
 * status colour, then «n مهام · m عاجلة · أقرب موعد …». Tapping it unfolds.
 */
function FoldedSummary({ name, items, onPress }: { name: string; items: MyTaskItem[]; onPress: () => void }) {
  const { urgentCount, nextDueDate } = summarizeFoldedGroup(items);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`عرض مهام ${name}`}
      onPress={onPress}
      style={({ pressed }) => ({
        gap: 10,
        paddingHorizontal: spacing.lg,
        paddingVertical: 14,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.line,
        borderRadius: radii.field,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flexDirection: "row", gap: 3, height: 6 }}>
        {items.map((item) => (
          <View
            key={`${item.kind}-${item.id}`}
            style={{
              flex: 1,
              borderRadius: radii.chip,
              // `??`: an API from before the field existed sends nothing at all.
              backgroundColor: statusColors[item.statusCategory ?? "UNCATEGORIZED"],
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <AppText size="caption" weight="semibold">
          {countLabel(items.length, TASKS)}
        </AppText>
        {urgentCount > 0 ? (
          <View style={{ backgroundColor: colors.urgentSoft, borderRadius: radii.chip, paddingHorizontal: spacing.sm }}>
            <AppText size="caption" weight="bold" color={colors.urgent}>
              {urgentCount} عاجلة
            </AppText>
          </View>
        ) : null}
        {nextDueDate ? (
          <AppText size="caption" color={colors.muted}>
            · أقرب موعد {formatDueDate(nextDueDate)}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

/** «وفي «مهامي»: المتأخّر ثم العاجل» (§3b-1) — stable, so ties keep their server order. */
function sortByUrgency(items: MyTaskItem[]): MyTaskItem[] {
  return [...items].sort((a, b) => (b.priority === "URGENT" ? 1 : 0) - (a.priority === "URGENT" ? 1 : 0));
}

function groupByBoard(items: MyTaskItem[]): { boardId: string; boardName: string; items: MyTaskItem[] }[] {
  const order: string[] = [];
  const byId = new Map<string, { boardId: string; boardName: string; items: MyTaskItem[] }>();
  for (const item of items) {
    let group = byId.get(item.boardId);
    if (!group) {
      group = { boardId: item.boardId, boardName: item.boardName, items: [] };
      byId.set(item.boardId, group);
      order.push(item.boardId);
    }
    group.items.push(item);
  }
  return order.map((id) => byId.get(id)!);
}
