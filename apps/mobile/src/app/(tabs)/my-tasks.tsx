import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { MyTaskItem } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { TaskRow } from "@/features/my-tasks/task-row";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { api } from "@/lib/api";
import { isOverdue } from "@/lib/date";
import { colors, spacing } from "@/theme/tokens";

/**
 * `/my-tasks` — everything assigned to me (cards + subtasks), across every
 * board. Per `v2-new-style.md` §7.1: overdue first (its own section, any
 * board), then the rest grouped by board.
 */
export default function MyTasksScreen() {
  const router = useRouter();
  const myTasks = useQuery({ queryKey: ["my-tasks"], queryFn: () => api.myTasks.list() });

  const overdue = sortByUrgency(myTasks.data?.items.filter((item) => item.dueDate && isOverdue(item.dueDate)) ?? []);
  const remaining = sortByUrgency(myTasks.data?.items.filter((item) => !(item.dueDate && isOverdue(item.dueDate))) ?? []);
  const boardGroups = groupByBoard(remaining);

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
        <NotificationBell />
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
                    <TaskRow key={`${item.kind}-${item.id}`} item={item} onPress={() => router.push(`/card/${item.cardId}`)} />
                  ))}
                </View>
              </View>
            ) : null}

            {boardGroups.map((group) => (
              <View key={group.boardId} style={{ gap: spacing.sm }}>
                <AppText size="small" weight="bold" color={colors.muted}>
                  {group.boardName}
                </AppText>
                <View style={{ gap: spacing.sm }}>
                  {group.items.map((item) => (
                    <TaskRow key={`${item.kind}-${item.id}`} item={item} onPress={() => router.push(`/card/${item.cardId}`)} />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
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
