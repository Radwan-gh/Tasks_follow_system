import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
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
import { useAuth } from "@/features/auth/auth-context";
import { TaskRow } from "@/features/my-tasks/task-row";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { api } from "@/lib/api";
import { useOpenCard } from "@/lib/board-cache";
import { formatDueDate, isOverdue } from "@/lib/date";
import { loadFoldedBoards, saveFoldedBoards } from "@/lib/folded-boards";
import { TASKS, countLabel } from "@/lib/plural";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

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
  const myTasks = useQuery({ queryKey: ["my-tasks"], queryFn: () => api.myTasks.list() });

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
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
      >
        <AppText size="heading" weight="bold">
          مهامي
        </AppText>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {boardGroups.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={anyOpen ? "طيّ كل اللوحات" : "فتح كل اللوحات"}
              onPress={() => applyFolds(toggleAllBoards(folded, liveBoardIds))}
              style={{
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={anyOpen ? "chevron-collapse-outline" : "chevron-expand-outline"} size={22} color={colors.ink} />
            </Pressable>
          ) : null}
          <NotificationBell />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl }}>
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
              <View style={{ gap: spacing.sm }}>
                <AppText size="small" weight="bold" color={colors.alert}>
                  متأخّرة
                </AppText>
                <View style={{ gap: spacing.sm }}>
                  {overdue.map((item) => (
                    <TaskRow key={`${item.kind}-${item.id}`} item={item} onPress={() => openCard(item.cardId, item.boardId)} />
                  ))}
                </View>
              </View>
            ) : null}

            {boardGroups.map((group) => {
              const open = !folded.has(group.boardId);
              const toggle = () => applyFolds(toggleFoldedBoard(folded, group.boardId, liveBoardIds));
              return (
                <View key={group.boardId} style={{ gap: spacing.sm }}>
                  <BoardGroupHeader name={group.boardName} count={group.items.length} open={open} onPress={toggle} />
                  {open ? (
                    <View style={{ gap: spacing.sm }}>
                      {group.items.map((item) => (
                        <TaskRow key={`${item.kind}-${item.id}`} item={item} onPress={() => openCard(item.cardId, item.boardId)} />
                      ))}
                    </View>
                  ) : (
                    <FoldedSummary name={group.boardName} items={group.items} onPress={toggle} />
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
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
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: MIN_TOUCH_TARGET }}
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
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
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
