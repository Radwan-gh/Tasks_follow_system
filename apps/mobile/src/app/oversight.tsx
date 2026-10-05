import { useDeferredValue, useState } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { OversightTask } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BoardCardSkeleton, Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { BoardCard } from "@/features/boards/board-card";
import {
  EMPTY_OVERSIGHT_FILTER,
  OversightFilterSheet,
  STATUS_LABELS,
  isOversightFilterActive,
  type OversightFilter,
} from "@/features/oversight/oversight-filter-sheet";
import { api } from "@/lib/api";
import { useOpenCard } from "@/lib/board-cache";
import { formatDueDate, isOverdue } from "@/lib/date";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing, statusColors } from "@/theme/tokens";

type Tab = "boards" | "tasks";

/**
 * `/oversight` («المتابعة») — every board and every task, for an ADMIN or a
 * user granted `canViewAllBoards`; reached from the account tab. Read-only:
 * opening a board or task lands on the normal screens, which the server marks
 * `supervised` and which then render like a viewer's.
 */
export default function OversightScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("boards");

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size="title" weight="bold">
            المتابعة
          </AppText>
          <AppText size="caption" color={colors.muted}>
            كل اللوحات والمهام، للقراءة فقط
          </AppText>
        </View>
      </View>

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          marginHorizontal: spacing.xl,
          marginVertical: spacing.md,
          padding: spacing.xs,
          borderRadius: radii.field,
          backgroundColor: colors.line,
        }}
      >
        {(["boards", "tasks"] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: radii.field - 4,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tab === t ? colors.surface : "transparent",
            }}
          >
            <AppText size="small" weight={tab === t ? "semibold" : "regular"} color={tab === t ? colors.ink : colors.muted}>
              {t === "boards" ? "اللوحات" : "المهام"}
            </AppText>
          </Pressable>
        ))}
      </View>

      {tab === "boards" ? <AllBoards /> : <AllTasks />}
    </Screen>
  );
}

// ── Boards ──────────────────────────────────────────────────────────────

function AllBoards() {
  const router = useRouter();
  const [archived, setArchived] = useState(false);
  const boards = useQuery({
    queryKey: ["oversight", "boards", archived],
    queryFn: () => api.oversight.boards({ archived }),
  });

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md }}>
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        <ToggleChip label="النشطة" active={!archived} onPress={() => setArchived(false)} />
        <ToggleChip label="المؤرشفة" active={archived} onPress={() => setArchived(true)} />
      </View>
      {boards.isPending ? (
        <>
          <BoardCardSkeleton />
          <BoardCardSkeleton />
        </>
      ) : boards.isError ? (
        <ErrorState onRetry={() => void boards.refetch()} />
      ) : boards.data.length === 0 ? (
        <EmptyState
          icon={archived ? "archive-outline" : "grid-outline"}
          title={archived ? "لا لوحات مؤرشفة" : "لا لوحات بعد"}
          message={archived ? "اللوحات المؤرشفة في النظام تظهر هنا." : "اللوحات التي ينشئها أي مستخدم تظهر هنا."}
        />
      ) : (
        boards.data.map((board) => (
          <BoardCard
            key={board.id}
            board={board}
            isOwner={false}
            archived={board.isArchived}
            ownerName={board.owner.displayName}
            onPress={() => router.push(`/board/${board.id}`)}
          />
        ))
      )}
    </ScrollView>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────

function AllTasks() {
  const openCard = useOpenCard();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [filter, setFilter] = useState<OversightFilter>(EMPTY_OVERSIGHT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);

  const users = useQuery({ queryKey: ["oversight", "users"], queryFn: () => api.oversight.users() });
  const boards = useQuery({ queryKey: ["oversight", "boards", false], queryFn: () => api.oversight.boards() });

  const query = {
    q: q || undefined,
    assigneeId: filter.assigneeId ?? undefined,
    boardId: filter.boardId ?? undefined,
    statusCategory: filter.statusCategory ?? undefined,
    overdue: overdueOnly ? ("true" as const) : undefined,
    includeCompleted: filter.includeCompleted ? ("true" as const) : undefined,
  };
  const tasks = useInfiniteQuery({
    queryKey: ["oversight", "tasks", query],
    queryFn: ({ pageParam }) => api.oversight.tasks({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = tasks.data?.pages.flatMap((p) => p.items) ?? [];
  const filterActive = isOversightFilterActive(filter);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث بعنوان المهمة"
          placeholderTextColor={colors.muted}
          accessibilityLabel="ابحث بعنوان المهمة"
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <ToggleChip label="المتأخّرة فقط" active={overdueOnly} onPress={() => setOverdueOnly((v) => !v)} />
          <ToggleChip
            label={filterActive ? "ترشيح ●" : "ترشيح"}
            active={filterActive}
            onPress={() => setFilterOpen(true)}
          />
        </View>
      </View>

      {tasks.isPending ? (
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          <Skeleton height={86} radius={radii.card} />
          <Skeleton height={86} radius={radii.card} />
          <Skeleton height={86} radius={radii.card} />
        </View>
      ) : tasks.isError ? (
        <ErrorState onRetry={() => void tasks.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md }}
          renderItem={({ item }) => <OversightTaskRow task={item} onPress={() => openCard(item.id, item.boardId)} />}
          onEndReached={() => {
            if (tasks.hasNextPage && !tasks.isFetchingNextPage) void tasks.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title={filterActive || overdueOnly || q ? "لا مهام مطابقة" : "لا مهام مفتوحة"}
              message={filterActive || overdueOnly || q ? "غيّر البحث أو التصفية لعرض مهام أخرى." : "المهام المفتوحة في كل اللوحات تظهر هنا."}
            />
          }
          ListFooterComponent={tasks.isFetchingNextPage ? <Skeleton height={86} radius={radii.card} /> : null}
        />
      )}

      <OversightFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filter}
        onChange={setFilter}
        users={users.data ?? []}
        boards={boards.data ?? []}
      />
    </View>
  );
}

function OversightTaskRow({ task, onPress }: { task: OversightTask; onPress: () => void }) {
  const done = task.statusCategory === "DONE" || task.statusCategory === "CLOSED";
  const overdue = !!task.dueDate && !done && isOverdue(task.dueDate);
  const status = task.statusCategory ?? "UNCATEGORIZED";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        // borderLeft* renders on the physical right under forceRTL — see task-row.tsx.
        borderLeftWidth: task.priority === "URGENT" ? 3 : 1,
        borderLeftColor: task.priority === "URGENT" ? colors.urgent : colors.line,
        borderRadius: radii.card,
        padding: spacing.lg,
        gap: spacing.xs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        {task.isRestricted ? <Ionicons name="lock-closed-outline" size={14} color={colors.muted} /> : null}
        <AppText weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
          {task.title}
        </AppText>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColors[status] }} />
        <AppText size="caption" color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
          {task.listName || (task.statusCategory ? STATUS_LABELS[task.statusCategory] : "")} · {task.boardName}
        </AppText>
      </View>
      <AppText size="caption" color={colors.muted} numberOfLines={1}>
        {task.assignees.length > 0 ? task.assignees.map((a) => a.displayName).join("، ") : "بلا مسؤول"}
      </AppText>
      {task.dueDate ? (
        <View
          style={{
            alignSelf: "flex-start",
            marginTop: spacing.xs,
            backgroundColor: overdue ? colors.alertSoft : colors.canvas,
            borderRadius: radii.chip,
            paddingHorizontal: spacing.md,
            paddingVertical: 4,
          }}
        >
          <AppText size="caption" weight="semibold" color={overdue ? colors.alert : colors.muted}>
            ◷ {formatDueDate(task.dueDate)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: spacing.lg,
        borderRadius: radii.chip,
        backgroundColor: active ? colors.accent : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
      }}
    >
      <AppText size="small" weight="semibold" color={active ? colors.surface : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}
