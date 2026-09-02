import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Card, List } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { BottomSheet } from "@/components/bottom-sheet";
import { ListColumn, sortByPriority } from "@/features/boards/list-column";
import { CardItem } from "@/features/boards/card-item";
import { MoveCardSheet } from "@/features/boards/move-card-sheet";
import { BoardSummarySheet } from "@/features/boards/board-summary-sheet";
import { BoardFilterSheet, EMPTY_BOARD_FILTER, isFilterActive, type BoardFilter } from "@/features/boards/board-filter-sheet";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/state-views";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

const COLUMN_WIDTH = 300;
const COLUMN_GAP = spacing.lg;

/**
 * `/boards/:id` — horizontal-scroll Kanban view (design's "اللوحة — تمرير أفقي
 * بين الحالات"). Tapping a card opens `/card/:id` (`app/card/[id].tsx`) for
 * full detail/editing. Card *creation* is a separate, not-yet-built feature
 * (see `apps/mobile/TASKS.md`).
 */
export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(COLUMN_WIDTH, width - spacing.xl * 2 - 24);

  // «انتهى» defaults to the last 30 days (`v2-new-style.md`'s "يعرض آخر 30
  // يومًا"); tapping "عرض الأقدم" clears this to load everything. Included in
  // the query key (not just passed to queryFn) so switching it triggers a
  // real refetch instead of serving the previous, differently-filtered cache.
  const [closedSince, setClosedSince] = useState<string | undefined>(() =>
    new Date(Date.now() - 30 * 86400000).toISOString(),
  );
  const board = useQuery({
    queryKey: ["board", id, closedSince ?? "all"],
    queryFn: () => api.boards.get(id, closedSince),
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_BOARD_FILTER);
  const listRef = useRef<FlatList<List>>(null);

  const move = useMutation({
    mutationFn: (input: { cardId: string; targetListId: string }) =>
      api.cards.update(input.cardId, { targetListId: input.targetListId }),
    onSuccess: () => {
      setMovingCardId(null);
      void queryClient.invalidateQueries({ queryKey: ["board", id] });
    },
  });

  const remove = useMutation({
    mutationFn: (cardId: string) => api.cards.remove(cardId),
    onSuccess: () => {
      setDeletingCardId(null);
      void queryClient.invalidateQueries({ queryKey: ["board", id] });
    },
  });

  const restore = useMutation({
    mutationFn: () => api.boards.update(id, { isArchived: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", id] });
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });

  const trimmedSearch = searchText.trim();
  // §3b-2: search + filter renders a flat list grouped by status, not columns.
  const searchResults = useMemo(() => {
    if (!board.data) return [];
    return board.data.lists
      .map((list) => ({
        list,
        cards: sortByPriority(list.cards).filter((card) => {
          if (trimmedSearch && !card.title.toLowerCase().includes(trimmedSearch.toLowerCase())) return false;
          if (filter.myTasksOnly && !(user && card.assigneeIds.includes(user.id))) return false;
          if (filter.memberIds.length > 0 && !card.assigneeIds.some((uid) => filter.memberIds.includes(uid))) return false;
          if (filter.priorities.length > 0 && !filter.priorities.includes(card.priority)) return false;
          return true;
        }),
      }))
      .filter((group) => group.cards.length > 0);
  }, [board.data, trimmedSearch, filter, user]);

  const isOwner = !!user && board.data?.ownerId === user.id;
  /** Board owner or this card's own assignees may move it into «انتهى» — §3b-4. */
  function canCloseCard(card: Card): boolean {
    return !!user && (board.data?.ownerId === user.id || card.assigneeIds.includes(user.id));
  }

  const resolveAssignees = useMemo(() => {
    const byId = new Map(board.data?.members.map((m) => [m.userId, m.user] as const) ?? []);
    return (ids: string[]) =>
      ids.map((userId) => byId.get(userId)).filter((u): u is NonNullable<typeof u> => !!u);
  }, [board.data]);

  const activeCardInfo = useMemo(() => {
    if (!board.data || !movingCardId) return null;
    const listIndex = board.data.lists.findIndex((list) => list.cards.some((c) => c.id === movingCardId));
    if (listIndex === -1) return null;
    const card = board.data.lists[listIndex]!.cards.find((c) => c.id === movingCardId)!;
    const nextListId = board.data.lists[listIndex + 1]?.id ?? null;
    return { card, nextListId };
  }, [board.data, movingCardId]);

  const deletingCard = useMemo(() => {
    if (!board.data || !deletingCardId) return null;
    for (const list of board.data.lists) {
      const card = list.cards.find((c) => c.id === deletingCardId);
      if (card) return card;
    }
    return null;
  }, [board.data, deletingCardId]);

  // Under forced RTL, this FlatList's `getItemLayout`-based offset math is
  // mirrored end-to-start relative to what's actually rendered — confirmed by
  // hand on-device (tapping column 1 of 5 lands on column 3 = length-1-index).
  // That mirroring affects both `scrollToIndex` and `onViewableItemsChanged`'s
  // reported index, so both are corrected the same way, via a ref (not
  // `board.data` directly — these callbacks are captured once by `useRef` so
  // FlatList doesn't see a new identity, which `viewabilityConfig` requires).
  const listsLengthRef = useRef(0);
  listsLengthRef.current = board.data?.lists.length ?? 0;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.index;
    if (first != null) setActiveIndex(listsLengthRef.current - 1 - first);
  }).current;

  function scrollToColumn(index: number) {
    listRef.current?.scrollToIndex({ index: listsLengthRef.current - 1 - index, animated: true });
  }

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.muted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size="title" weight="bold" numberOfLines={1}>
            {board.data?.name ?? " "}
          </AppText>
          {board.data ? (
            <AppText size="small" color={colors.muted}>
              {board.data.members.length} أعضاء · {board.data.lists.reduce((n, l) => n + l.cards.length, 0)} مهمة
            </AppText>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="بحث"
          onPress={() => setSearchOpen((v) => !v)}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name={searchOpen ? "close" : "search"} size={20} color={colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إعدادات اللوحة"
          onPress={() => (isOwner ? setMenuVisible(true) : router.push(`/board/${id}/settings`))}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "flex-end", justifyContent: "center" }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {board.data?.isArchived ? (
        <View
          style={{
            marginHorizontal: spacing.xl,
            marginBottom: spacing.md,
            backgroundColor: colors.canvas,
            borderRadius: radii.field,
            padding: spacing.md,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <AppText size="small" color={colors.muted} style={{ flex: 1 }}>
            هذه اللوحة مؤرشفة — للقراءة فقط
          </AppText>
          {isOwner ? (
            <Pressable accessibilityRole="button" onPress={() => restore.mutate()} disabled={restore.isPending}>
              <AppText size="small" weight="semibold" color={colors.accent}>
                {restore.isPending ? "جارٍ الاستعادة..." : "استعادة"}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {board.isPending ? (
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          <Skeleton height={32} width={220} radius={999} />
          <Skeleton height={420} radius={20} />
        </View>
      ) : board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : searchOpen ? (
        <>
          <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.canvas,
                borderRadius: radii.field,
                paddingHorizontal: spacing.md,
                minHeight: MIN_TOUCH_TARGET,
              }}
            >
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="ابحث في اللوحة"
                placeholderTextColor={colors.muted}
                autoFocus
                style={{
                  flex: 1,
                  fontFamily: fonts.regular,
                  fontSize: fontSizes.body,
                  color: colors.ink,
                  textAlign: "right",
                  writingDirection: "rtl",
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ترشيح"
              onPress={() => setFilterVisible(true)}
              style={{
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                borderWidth: 1,
                borderColor: isFilterActive(filter) ? colors.accent : colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="options-outline" size={18} color={isFilterActive(filter) ? colors.accent : colors.muted} />
            </Pressable>
          </View>

          {isFilterActive(filter) ? (
            <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilter(EMPTY_BOARD_FILTER)}
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                  backgroundColor: colors.accentSoft,
                  borderRadius: 999,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                }}
              >
                <AppText size="small" weight="semibold" color={colors.accent}>
                  مرشَّح ✕
                </AppText>
              </Pressable>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg }}>
            {searchResults.length === 0 ? (
              <EmptyState
                icon="search-outline"
                title={trimmedSearch ? `لا نتائج لـ "${trimmedSearch}"` : "لا نتائج"}
                message="جرّب كلمة أخرى أو امسح الترشيح."
              />
            ) : (
              searchResults.map(({ list, cards }) => (
                <View key={list.id} style={{ gap: spacing.sm }}>
                  <AppText size="small" weight="bold" color={colors.muted}>
                    {list.name} · {cards.length}
                  </AppText>
                  <View style={{ gap: spacing.sm }}>
                    {cards.map((card) => (
                      <CardItem
                        key={card.id}
                        card={card}
                        assignees={resolveAssignees(card.assigneeIds)}
                        hasNext={false}
                        onMoveNext={() => {}}
                        onLongPress={() => setMovingCardId(card.id)}
                        onOpen={() => router.push(`/card/${card.id}`)}
                        highlightQuery={trimmedSearch}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: spacing.md }}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}
          >
            {board.data.lists.map((list, index) => (
              <Pressable
                key={list.id}
                onPress={() => scrollToColumn(index)}
                style={{
                  borderRadius: 999,
                  minHeight: MIN_TOUCH_TARGET,
                  justifyContent: "center",
                  paddingHorizontal: spacing.lg,
                  backgroundColor: index === activeIndex ? colors.accent : colors.surface,
                  borderWidth: index === activeIndex ? 0 : 1,
                  borderColor: colors.line,
                }}
              >
                <AppText
                  size="small"
                  weight={index === activeIndex ? "semibold" : "regular"}
                  color={index === activeIndex ? colors.surface : colors.muted}
                >
                  {list.name} · {list.cards.length}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          {board.data.lists.length === 0 ? (
            <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xl }}>
              لا حالات في هذه اللوحة بعد.
            </AppText>
          ) : (
            <FlatList
              ref={listRef}
              data={board.data.lists}
              keyExtractor={(list) => list.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={columnWidth + COLUMN_GAP}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: COLUMN_GAP }}
              getItemLayout={(_, index) => ({
                length: columnWidth + COLUMN_GAP,
                offset: (columnWidth + COLUMN_GAP) * index,
                index,
              })}
              viewabilityConfig={viewabilityConfig}
              onViewableItemsChanged={onViewableItemsChanged}
              renderItem={({ item, index }) => (
                <ListColumn
                  list={item}
                  width={columnWidth}
                  resolveAssignees={resolveAssignees}
                  hasNext={index < board.data!.lists.length - 1}
                  nextListIsClosed={board.data!.lists[index + 1]?.statusCategory === "CLOSED"}
                  canCloseCard={canCloseCard}
                  readOnly={!!board.data!.isArchived}
                  onMoveCardNext={(cardId) => {
                    const nextList = board.data!.lists[index + 1];
                    if (nextList) move.mutate({ cardId, targetListId: nextList.id });
                  }}
                  onLongPressCard={(cardId) => setMovingCardId(cardId)}
                  onOpenCard={(cardId) => router.push(`/card/${cardId}`)}
                  onAddCard={() => router.push(`/board/${id}/cards/new?listId=${item.id}`)}
                  showLoadOlder={item.statusCategory === "CLOSED" && !!closedSince}
                  onLoadOlder={() => setClosedSince(undefined)}
                />
              )}
            />
          )}

          {board.data.lists[activeIndex] && !board.data.isArchived ? (
            <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/board/${id}/cards/new?listId=${board.data!.lists[activeIndex]!.id}`)}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  borderRadius: radii.field,
                  backgroundColor: colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText weight="semibold" color={colors.surface}>
                  + مهمة جديدة في «{board.data.lists[activeIndex]!.name}»
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      <MoveCardSheet
        visible={!!movingCardId}
        onClose={() => setMovingCardId(null)}
        card={activeCardInfo?.card ?? null}
        lists={board.data?.lists ?? []}
        nextListId={activeCardInfo?.nextListId ?? null}
        canCloseCard={activeCardInfo ? canCloseCard(activeCardInfo.card) : false}
        onMove={(targetListId) => {
          if (activeCardInfo) move.mutate({ cardId: activeCardInfo.card.id, targetListId });
        }}
        onRequestDelete={() => {
          if (activeCardInfo) {
            setDeletingCardId(activeCardInfo.card.id);
            setMovingCardId(null);
          }
        }}
      />

      <ConfirmSheet
        visible={!!deletingCardId}
        onClose={() => setDeletingCardId(null)}
        title="حذف البطاقة"
        consequence={
          deletingCard
            ? `سيتم حذف «${deletingCard.title}» ومهامها الفرعية ومرفقاتها نهائيًا. لا يمكن التراجع.`
            : "سيتم حذف المهمة ومهامها الفرعية ومرفقاتها نهائيًا. لا يمكن التراجع."
        }
        confirmLabel="حذف"
        confirming={remove.isPending}
        onConfirm={() => {
          if (deletingCardId) remove.mutate(deletingCardId);
        }}
      />

      <BottomSheet visible={menuVisible} onClose={() => setMenuVisible(false)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuVisible(false);
              setSummaryVisible(true);
            }}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <AppText weight="semibold">ملخّص اللوحة</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuVisible(false);
              router.push(`/board/${id}/settings`);
            }}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <AppText weight="semibold">إعدادات اللوحة</AppText>
          </Pressable>
        </View>
      </BottomSheet>

      <BoardSummarySheet visible={summaryVisible} onClose={() => setSummaryVisible(false)} boardId={id} />

      <BoardFilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        value={filter}
        onChange={setFilter}
        members={board.data?.members ?? []}
      />
    </Screen>
  );
}
