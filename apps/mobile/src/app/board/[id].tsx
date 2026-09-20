import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardDetail, Card } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { BottomSheet } from "@/components/bottom-sheet";
import { ListColumn, sortByPriority } from "@/features/boards/list-column";
import { CardItem } from "@/features/boards/card-item";
import { MoveCardSheet } from "@/features/boards/move-card-sheet";
import { QuickAddCard } from "@/features/boards/quick-add-card";
import { BoardSummarySheet } from "@/features/boards/board-summary-sheet";
import { BoardFilterSheet, EMPTY_BOARD_FILTER, isFilterActive, type BoardFilter } from "@/features/boards/board-filter-sheet";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/state-views";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * `/boards/:id` — horizontal-scroll Kanban view (design's "اللوحة — تمرير أفقي
 * بين الحالات"). Tapping a card opens `/card/:id` (`app/card/[id].tsx`) for
 * full detail/editing. Creating one is inline and title-only (`QuickAddCard`,
 * in the bottom bar for the active status only); the full
 * `cards/new` screen is the opt-in path behind «تفاصيل».
 */

/** Never sent to the server — replaced by the real id once the create request resolves. */
function makeTempId(): string {
  return `temp:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moveCardInBoard(board: BoardDetail, cardId: string, targetListId: string): BoardDetail {
  let moved: Card | null = null;
  const withoutCard = board.lists.map((list) => {
    const card = list.cards.find((c) => c.id === cardId);
    if (!card) return list;
    moved = { ...card, listId: targetListId };
    return { ...list, cards: list.cards.filter((c) => c.id !== cardId) };
  });
  if (!moved) return board;
  return {
    ...board,
    lists: withoutCard.map((list) => (list.id === targetListId ? { ...list, cards: [...list.cards, moved!] } : list)),
  };
}

function removeCardFromBoard(board: BoardDetail, cardId: string): BoardDetail {
  return { ...board, lists: board.lists.map((list) => ({ ...list, cards: list.cards.filter((c) => c.id !== cardId) })) };
}

function addCardToBoard(board: BoardDetail, listId: string, card: Card): BoardDetail {
  return { ...board, lists: board.lists.map((list) => (list.id === listId ? { ...list, cards: [...list.cards, card] } : list)) };
}

function makeTempCard(input: { id: string; listId: string; boardId: string; title: string; createdById: string }): Card {
  return {
    id: input.id,
    listId: input.listId,
    boardId: input.boardId,
    title: input.title,
    description: null,
    position: "",
    dueDate: null,
    dueDateHasTime: false,
    createdById: input.createdById,
    isArchived: false,
    isRestricted: false,
    memberIds: [],
    assigneeIds: [],
    priority: "NORMAL",
    costAmount: null,
    costNote: null,
    recurrence: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  // One status per screen: each page is exactly the viewport wide, so a
  // neighbouring status's cards never bleed in at either edge. The page
  // carries the side gutters and the column fills what is left.
  const columnWidth = width - spacing.xl * 2;

  // «انتهى» defaults to the last 30 days (`v2-new-style.md`'s "يعرض آخر 30
  // يومًا"); tapping "عرض الأقدم" clears this to load everything. Included in
  // the query key (not just passed to queryFn) so switching it triggers a
  // real refetch instead of serving the previous, differently-filtered cache.
  const [closedSince, setClosedSince] = useState<string | undefined>(() =>
    new Date(Date.now() - 30 * 86400000).toISOString(),
  );
  const boardQueryKey = ["board", id, closedSince ?? "all"] as const;
  const board = useQuery({
    queryKey: boardQueryKey,
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
  const listRef = useRef<ScrollView>(null);
  const chipsRef = useRef<ScrollView>(null);

  const move = useMutation({
    mutationFn: (input: { cardId: string; targetListId: string }) =>
      api.cards.update(input.cardId, { targetListId: input.targetListId }),
    onMutate: async (input) => {
      setMovingCardId(null);
      await queryClient.cancelQueries({ queryKey: boardQueryKey });
      const previous = queryClient.getQueryData<BoardDetail>(boardQueryKey);
      if (previous) queryClient.setQueryData(boardQueryKey, moveCardInBoard(previous, input.cardId, input.targetListId));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(boardQueryKey, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["board", id] }),
  });

  const newCardHref = (listId: string, draftTitle: string) =>
    `/board/${id}/cards/new?listId=${listId}${draftTitle ? `&title=${encodeURIComponent(draftTitle)}` : ""}`;

  const addCard = useMutation({
    mutationFn: (input: { listId: string; title: string }) => api.cards.create(input.listId, { title: input.title }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey });
      const previous = queryClient.getQueryData<BoardDetail>(boardQueryKey);
      if (previous) {
        const temp = makeTempCard({
          id: makeTempId(),
          listId: input.listId,
          boardId: id,
          title: input.title,
          createdById: user?.id ?? "",
        });
        queryClient.setQueryData(boardQueryKey, addCardToBoard(previous, input.listId, temp));
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(boardQueryKey, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["board", id] }),
  });

  const remove = useMutation({
    mutationFn: (cardId: string) => api.cards.remove(cardId),
    onMutate: async (cardId) => {
      setDeletingCardId(null);
      await queryClient.cancelQueries({ queryKey: boardQueryKey });
      const previous = queryClient.getQueryData<BoardDetail>(boardQueryKey);
      if (previous) queryClient.setQueryData(boardQueryKey, removeCardFromBoard(previous, cardId));
      return { previous };
    },
    onError: (_err, _cardId, context) => {
      if (context?.previous) queryClient.setQueryData(boardQueryKey, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["board", id] }),
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
  // §3c-4 "اللوحة بعين المشاهد ... بلا أسهم نقل ولا «+ إضافة مهمة» ولا سحب".
  const myRole = board.data?.members.find((m) => m.userId === user?.id)?.role;
  const isViewer = myRole === "VIEWER";
  const boardReadOnly = !!board.data?.isArchived || isViewer;
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

  // The columns pager, right-to-left.
  //
  // The lists render in natural order inside a plain `ScrollView` and Yoga's
  // RTL handling lays them out right-to-left for real — «جديد» at the screen's
  // right edge, every later status further left, matching the status chips
  // above (which are the same plain `ScrollView` and have always been right).
  //
  // What is *not* mirrored is `contentOffset.x`: it stays a raw left-to-right
  // measurement, so offset 0 is the **left**-most column — the *last* status,
  // not the first. Deriving an index from `offset / stride` therefore reads
  // the list backwards, which is what put «انتهى» in the "add task" button
  // while «جديد» was the column actually on screen. (`FlatList`'s
  // `getItemLayout`/`scrollToIndex`/`onViewableItemsChanged` make the same
  // assumption internally, which is why no amount of reversing its data or
  // mirroring it with `scaleX` stayed correct at every boundary.)
  //
  // So nothing here assumes a direction: each page reports its own laid-out
  // `x`, which — because a page is exactly the viewport wide — *is* the scroll
  // offset that shows it. Those measured offsets drive the snap points, the
  // chip-tap jumps and the active-column lookup alike, so the pager is correct
  // whichever way the platform decides to lay it out.
  const columnOffsets = useRef<number[]>([]);
  const [snapOffsets, setSnapOffsets] = useState<number[]>([]);

  function handleColumnLayout(index: number, x: number) {
    if (columnOffsets.current[index] === x) return;
    columnOffsets.current[index] = x;
    const measured = columnOffsets.current.filter((value) => value != null);
    if (measured.length === board.data?.lists.length) {
      setSnapOffsets([...measured].sort((a, b) => a - b));
    }
  }

  function indexFromOffset(offsetX: number) {
    let closest = activeIndex;
    let smallestGap = Infinity;
    columnOffsets.current.forEach((offset, index) => {
      const gap = Math.abs(offset - offsetX);
      if (gap < smallestGap) {
        smallestGap = gap;
        closest = index;
      }
    });
    return closest;
  }

  function scrollToColumn(index: number, animated = true) {
    const offset = columnOffsets.current[index];
    if (offset != null) listRef.current?.scrollTo({ x: offset, animated });
  }

  // Android already parks an RTL scroll view at its reading start, which is
  // this same column — but the opening position is set explicitly, once,
  // rather than relied on.
  const didInitialScroll = useRef(false);

  // The chip strip is narrower than the list of statuses, so the active chip
  // can sit off-screen (it did for «انتهى» on a five-status board) and the
  // header then looks like nothing is selected. Keep it centred on whichever
  // column the pager is showing, measured the same way for the same reason.
  const chipCenters = useRef<number[]>([]);
  useEffect(() => {
    const center = chipCenters.current[activeIndex];
    if (center == null) return;
    chipsRef.current?.scrollTo({ x: Math.max(0, center - width / 2), animated: true });
  }, [activeIndex, width]);

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
      ) : isViewer ? (
        <View
          style={{
            marginHorizontal: spacing.xl,
            marginBottom: spacing.md,
            backgroundColor: colors.canvas,
            borderRadius: radii.field,
            padding: spacing.md,
          }}
        >
          <AppText size="small" color={colors.muted}>
            للعرض فقط — أنت مشاهد في هذه اللوحة
          </AppText>
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
                        onLongPress={() => !boardReadOnly && setMovingCardId(card.id)}
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
            ref={chipsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: spacing.md }}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}
          >
            {board.data.lists.map((list, index) => (
              <Pressable
                key={list.id}
                onPress={() => scrollToColumn(index)}
                onLayout={(e) => {
                  const { x, width: chipWidth } = e.nativeEvent.layout;
                  chipCenters.current[index] = x + chipWidth / 2;
                }}
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
            <ScrollView
              ref={listRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToOffsets={snapOffsets.length > 0 ? snapOffsets : undefined}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onScroll={(e) => setActiveIndex(indexFromOffset(e.nativeEvent.contentOffset.x))}
              onContentSizeChange={() => {
                if (didInitialScroll.current || snapOffsets.length === 0) return;
                didInitialScroll.current = true;
                scrollToColumn(0, false);
              }}
            >
              {board.data.lists.map((list, index) => (
                <View
                  key={list.id}
                  style={{ width, paddingHorizontal: spacing.xl }}
                  onLayout={(e) => handleColumnLayout(index, e.nativeEvent.layout.x)}
                >
                  <ListColumn
                    list={list}
                    width={columnWidth}
                    resolveAssignees={resolveAssignees}
                    hasNext={index < board.data!.lists.length - 1}
                    nextListIsClosed={board.data!.lists[index + 1]?.statusCategory === "CLOSED"}
                    canCloseCard={canCloseCard}
                    readOnly={boardReadOnly}
                    onMoveCardNext={(cardId) => {
                      if (cardId.startsWith("temp:")) return;
                      const nextList = board.data!.lists[index + 1];
                      if (nextList) move.mutate({ cardId, targetListId: nextList.id });
                    }}
                    onLongPressCard={(cardId) => (cardId.startsWith("temp:") ? undefined : setMovingCardId(cardId))}
                    onOpenCard={(cardId) => (cardId.startsWith("temp:") ? undefined : router.push(`/card/${cardId}`))}
                    showLoadOlder={list.statusCategory === "CLOSED" && !!closedSince}
                    onLoadOlder={() => setClosedSince(undefined)}
                  />
                </View>
              ))}
            </ScrollView>
          )}

          {/* A column is a plain `View` with no scroll of its own, so a long
              column pushes its own add row off screen — this bar is the entry
              point that stays reachable, hence a field rather than a button. */}
          {board.data.lists[activeIndex] && !boardReadOnly ? (
            <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
              <QuickAddCard
                placeholder={`+ مهمة جديدة في «${board.data.lists[activeIndex]!.name}»`}
                onAdd={(title) => addCard.mutateAsync({ listId: board.data!.lists[activeIndex]!.id, title })}
                onOpenDetails={(draft) => router.push(newCardHref(board.data!.lists[activeIndex]!.id, draft))}
              />
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
