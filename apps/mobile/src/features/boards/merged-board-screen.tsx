import { useEffect, useMemo, useRef, useState } from "react";
import { I18nManager, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardDetail, BoardSummary } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/state-views";
import { Toast, type ToastMessage } from "@/components/toast";
import { useAuth } from "@/features/auth/auth-context";
import { CardItem } from "@/features/boards/card-item";
import { api } from "@/lib/api";
import { mergeBoardColumns, type MergedCard } from "@/lib/all-boards";
import { boardDetailKey, recentClosedSince, useOpenCard } from "@/lib/board-cache";
import { BOARDS, TASKS, countLabel } from "@/lib/plural";
import { indexFromOffset, resolveColumnOffsets, snapOffsetsFor } from "@/lib/status-pager";
import { GUTTER, MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * One board made of several: «الكل» (`/all-tasks`, every board the user is
 * on) and a category (`/category/:id`, that category's boards). Laid out like
 * the board screen (status chips over a pager of columns), its columns are the
 * status categories with each board's lists merged in (`mergeBoardColumns`);
 * every card says which board it is on and keeps its ← arrow, which moves it
 * to the next list on its own board. No drag, quick-add or in-board search:
 * those belong to a single board.
 */
export function MergedBoardScreen({
  title,
  tileColor,
  includeBoard,
}: {
  title: string;
  /** A category's colour tile beside the title; `null` draws the neutral «بلا تصنيف» tile, omitted none. */
  tileColor?: string | null;
  /** Which of the user's boards to merge — all of them when omitted. */
  includeBoard?: (board: BoardSummary) => boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const openCard = useOpenCard();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const chipsRef = useRef<ScrollView>(null);

  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list() });
  const summaries = includeBoard ? (boards.data ?? []).filter(includeBoard) : (boards.data ?? []);
  const details = useQueries({
    queries: summaries.map((board) => ({
      // The board screen's default «انتهى» window, so both share one cache entry.
      queryKey: boardDetailKey(board.id, "recent"),
      queryFn: () => api.boards.get(board.id, recentClosedSince()),
    })),
  });
  const loaded = !!boards.data && details.every((q) => q.data);
  const failed = boards.isError || details.some((q) => q.isError);
  const detailData = details.map((q) => q.data);
  const columns = loaded ? mergeBoardColumns(detailData.map((d) => d!), user?.id) : [];
  const total = columns.reduce((sum, c) => sum + c.cards.length, 0);

  // Each card's people, resolved against the members of its own board.
  const peopleByBoard = new Map<string, Map<string, BoardDetail["members"][number]["user"]>>();
  for (const d of detailData) if (d) peopleByBoard.set(d.id, new Map(d.members.map((m) => [m.userId, m.user] as const)));
  function assigneesOf(item: MergedCard) {
    const people = peopleByBoard.get(item.boardId);
    return item.card.assigneeIds.map((id) => people?.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }

  const moveNext = useMutation({
    mutationFn: (item: MergedCard) => api.cards.update(item.card.id, { targetListId: item.nextListId! }),
    onError: () => setToast({ id: Date.now(), message: "تعذّر نقل المهمة. تحقّق من الاتصال وأعد المحاولة." }),
    onSettled: (_data, _error, item) =>
      Promise.all([
        // A task on several boards moves on all of them.
        ...item.card.placements.map((p) => queryClient.invalidateQueries({ queryKey: ["board", p.boardId] })),
        queryClient.invalidateQueries({ queryKey: ["board", item.boardId] }),
        queryClient.invalidateQueries({ queryKey: ["card", item.card.id] }),
        queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["boards"] }),
      ]),
  });

  function refresh() {
    void boards.refetch();
    for (const q of details) void q.refetch();
  }

  // The status pager, right-to-left — the board screen's pager comment
  // (`app/board/[id].tsx`) has the full story. In RTL `contentOffset.x` stays
  // a raw left-to-right measurement, so `index * width` reads the columns
  // backwards: tapping «جديد» showed «انتهى» and a swipe lit up the wrong
  // chip. Each page measures its own `x` instead (on a plain `View` — the
  // column `ScrollView`'s refresh wrapper reports `x = 0` on Android), and
  // those offsets drive the chip jumps, the snap points and the active chip.
  const measuredOffsets = useRef<number[]>([]);
  const [columnOffsets, setColumnOffsets] = useState<number[]>([]);
  const snapOffsets = useMemo(() => snapOffsetsFor(columnOffsets), [columnOffsets]);
  const columnCount = columns.length;

  function handleColumnLayout(index: number, x: number) {
    if (measuredOffsets.current[index] === x) return;
    measuredOffsets.current[index] = x;
    const resolved = resolveColumnOffsets(measuredOffsets.current, columnCount, width, I18nManager.isRTL);
    if (resolved) setColumnOffsets(resolved);
  }

  // «مراجعة»/«أخرى» come and go with their cards, which shifts every later
  // page; re-resolve against the new count so no stale offset is used.
  useEffect(() => {
    measuredOffsets.current.length = columnCount;
    const resolved = resolveColumnOffsets(measuredOffsets.current, columnCount, width, I18nManager.isRTL);
    if (resolved) setColumnOffsets(resolved);
    setActiveIndex((i) => Math.min(i, Math.max(0, columnCount - 1)));
  }, [columnCount, width]);

  function goTo(index: number, animated = true) {
    const offset = columnOffsets[index];
    if (offset != null) pagerRef.current?.scrollTo({ x: offset, animated });
  }

  // Open on «جديد», set explicitly once the offsets are known.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current || columnOffsets.length === 0) return;
    didInitialScroll.current = true;
    goTo(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first resolved offsets
  }, [columnOffsets]);

  // Keep the active chip in view as the pager moves.
  const chipCenters = useRef<number[]>([]);
  useEffect(() => {
    const center = chipCenters.current[activeIndex];
    if (center == null) return;
    chipsRef.current?.scrollTo({ x: Math.max(0, center - width / 2), animated: true });
  }, [activeIndex, width]);

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: GUTTER, paddingBottom: spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </Pressable>
        {tileColor !== undefined ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radii.iconButton,
              backgroundColor: tileColor ?? colors.slateSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="folder-open" size={18} color={tileColor ? colors.surface : colors.muted} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="title" weight="bold" numberOfLines={1}>
            {title}
          </AppText>
          {loaded ? (
            <AppText size="caption" color={colors.muted}>
              {countLabel(total, TASKS)} في {countLabel(summaries.length, BOARDS)}
            </AppText>
          ) : null}
        </View>
      </View>

      {failed ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <ErrorState onRetry={refresh} />
        </View>
      ) : !loaded ? (
        <View style={{ paddingHorizontal: GUTTER, gap: spacing.sm }}>
          <Skeleton height={44} radius={999} />
          <Skeleton height={72} radius={14} />
          <Skeleton height={72} radius={14} />
        </View>
      ) : (
        <>
          <ScrollView
            ref={chipsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: spacing.md }}
            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: spacing.sm }}
          >
            {columns.map((column, index) => {
              const active = index === activeIndex;
              return (
                <Pressable
                  key={column.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => goTo(index)}
                  onLayout={(e) => {
                    const { x, width: chipWidth } = e.nativeEvent.layout;
                    chipCenters.current[index] = x + chipWidth / 2;
                  }}
                  style={{
                    borderRadius: 999,
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: "center",
                    paddingHorizontal: spacing.lg,
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.accent : colors.line,
                  }}
                >
                  <AppText size="small" weight={active ? "semibold" : "regular"} color={active ? colors.surface : colors.muted}>
                    {column.name} · {column.cards.length}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            ref={pagerRef}
            horizontal
            style={{ flex: 1 }}
            showsHorizontalScrollIndicator={false}
            snapToOffsets={snapOffsets.length > 0 ? snapOffsets : undefined}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={(e) => setActiveIndex(indexFromOffset(columnOffsets, e.nativeEvent.contentOffset.x, activeIndex))}
          >
            {columns.map((column, index) => (
              <View key={column.key} style={{ width }} onLayout={(e) => handleColumnLayout(index, e.nativeEvent.layout.x)}>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: spacing.xxl, gap: spacing.md }}
                  nestedScrollEnabled
                  refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: statusColors[column.key === "OTHER" ? "UNCATEGORIZED" : column.key],
                      }}
                    />
                    <AppText weight="bold" size="small">
                      {column.name}
                    </AppText>
                    <AppText size="caption" color={colors.muted}>
                      {column.cards.length}
                    </AppText>
                  </View>
                  {column.key === "CLOSED" ? (
                    <View style={{ backgroundColor: colors.canvas, borderRadius: radii.field, padding: spacing.md }}>
                      <AppText size="caption" color={colors.muted} style={{ textAlign: "center" }}>
                        تُعرض المهام التي انتهت خلال آخر 30 يومًا
                      </AppText>
                    </View>
                  ) : null}
                  {column.cards.length === 0 ? (
                    <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
                      لا مهام في هذه الحالة
                    </AppText>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      {sortMerged(column.cards).map((item) => (
                        <CardItem
                          key={item.card.id}
                          card={item.card}
                          boardName={item.boardName}
                          fullNames
                          assignees={assigneesOf(item)}
                          hasNext={item.canMoveNext && !(moveNext.isPending && moveNext.variables?.card.id === item.card.id)}
                          onMoveNext={() => moveNext.mutate(item)}
                          onOpen={() => openCard(item.card.id, item.boardId)}
                        />
                      ))}
                    </View>
                  )}
                </ScrollView>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <View pointerEvents="box-none" style={{ position: "absolute", start: spacing.xl, end: spacing.xl, bottom: spacing.lg }}>
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </View>
    </Screen>
  );
}

/** Urgent first, as a board column sorts — the rest keep board order. */
function sortMerged(items: MergedCard[]): MergedCard[] {
  const urgent = (item: MergedCard) => (item.card.priority === "URGENT" ? 1 : 0);
  return [...items].sort((a, b) => urgent(b) - urgent(a));
}
