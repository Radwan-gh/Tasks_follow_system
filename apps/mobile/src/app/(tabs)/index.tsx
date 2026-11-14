import { useEffect, useMemo, useRef, useState } from "react";
import { I18nManager, Modal, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageBoardCategories, groupBoardsByCategory, type BoardSummary } from "@app/types";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BoardCardSkeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import {
  BOARD_CATEGORIES_KEY,
  CategoryActionsSheet,
  CategoryNameSheet,
  CategoryOrderSheet,
  categoryColor,
  useBoardCategories,
} from "@/features/boards/board-categories";
import { BoardMembersSheet } from "@/features/boards/board-members-sheet";
import { BoardRow } from "@/features/boards/board-row";
import { NewBoardSheet } from "@/features/boards/new-board-sheet";
import { SearchField } from "@/features/search/search-field";
import { SearchEmpty, SearchResults, SearchSkeleton } from "@/features/search/search-results";
import { useSearch } from "@/features/search/use-search";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { useOpenCard } from "@/lib/board-cache";
import { loadOpenSections, saveOpenSections } from "@/lib/open-sections";
import { BOARDS, countLabel } from "@/lib/plural";
import { GUTTER, MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

export default function BoardsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list() });
  const archivedBoards = useQuery({ queryKey: ["boards", "archived"], queryFn: () => api.boards.listArchived() });
  const categories = useBoardCategories();
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [membersOf, setMembersOf] = useState<BoardSummary | null>(null);
  // Section keys: a category id, or `NONE` for «بلا تصنيف». Sections start
  // folded; the ones this user opened are remembered across launches.
  const [openSections, setOpenSections] = useState<ReadonlySet<string>>(new Set());
  const touchedSections = useRef(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [reorderingCategories, setReorderingCategories] = useState(false);
  const [actionsFor, setActionsFor] = useState<{ id: string; name: string; boardCount: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  // The «ابحث: لوحات، مهام، مهام فرعية» box (docs/19-search.md): two letters or more swap the
  // boards list for boards, tasks and subtasks matching them.
  const [searchText, setSearchText] = useState("");
  const search = useSearch(searchText);
  const openCard = useOpenCard();

  // Creating, renaming and deleting categories is admin-only; admins also see
  // the empty ones, which they're presumably about to fill.
  const isCategoryAdmin = !!user && canManageBoardCategories(user);
  const sections = useMemo(
    () =>
      boards.data ? groupBoardsByCategory(boards.data, categories.data ?? [], { includeEmpty: isCategoryAdmin }) : [],
    [boards.data, categories.data, isCategoryAdmin],
  );
  const grouped = sections.some((s) => s.category !== null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    touchedSections.current = false;
    setOpenSections(new Set());
    let cancelled = false;
    void loadOpenSections(userId).then((saved) => {
      // A tap that landed before the read finished wins over the saved state.
      if (!cancelled && !touchedSections.current) setOpenSections(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function toggle(key: string) {
    if (!userId) return;
    touchedSections.current = true;
    const next = new Set(openSections);
    if (!next.delete(key)) next.add(key);
    // Drop ids of categories that no longer exist so the stored list stays short.
    if (categories.data) {
      const live = new Set(categories.data.map((c) => c.id));
      for (const k of next) if (k !== "NONE" && !live.has(k)) next.delete(k);
    }
    setOpenSections(next);
    saveOpenSections(userId, next);
  }

  const createBoard = useMutation({
    mutationFn: (input: { name: string; dueDate: string | null; categoryId: string | null }) =>
      api.boards.create({ name: input.name, dueDate: input.dueDate, categoryId: input.categoryId }),
    onSuccess: (board) => {
      setCreatingBoard(false);
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      router.push(`/board/${board.id}`);
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.boardCategories.remove(id),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: BOARD_CATEGORIES_KEY });
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
    onError: () => setDeleting(null),
  });

  function openBoard(board: BoardSummary) {
    router.push(`/board/${board.id}`);
  }

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: GUTTER,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size="small" color={colors.muted}>
            مرحبًا، {user?.displayName ?? ""}
          </AppText>
          <AppText size="heading" weight="bold">
            اللوحات
          </AppText>
        </View>
        <NotificationBell />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="لوحة جديدة"
          onPress={() => setCreatingBoard(true)}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            borderRadius: 999,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText size="title" weight="bold" color={colors.accent}>
            +
          </AppText>
        </Pressable>
        {isCategoryAdmin ? (
          <CategoriesMenu
            canReorder={(categories.data?.length ?? 0) > 1}
            onNew={() => setCreatingCategory(true)}
            onReorder={() => setReorderingCategories(true)}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", paddingHorizontal: GUTTER, paddingBottom: 14 }}>
        <SearchField value={searchText} onChangeText={setSearchText} placeholder="ابحث: لوحات، مهام، مهام فرعية" />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshControl={
          search.active ? (
            <RefreshControl
              refreshing={search.query.isRefetching && !search.pending}
              onRefresh={() => void search.query.refetch()}
            />
          ) : (
            <RefreshControl refreshing={boards.isRefetching} onRefresh={() => void boards.refetch()} />
          )
        }
      >
        {search.active ? (
          search.query.isError && !search.query.data ? (
            <ErrorState onRetry={() => void search.query.refetch()} />
          ) : !search.query.data ? (
            <SearchSkeleton />
          ) : search.query.data.boards.length + search.query.data.cards.length + search.query.data.subtasks.length ===
            0 ? (
            search.pending ? (
              <SearchSkeleton />
            ) : (
              <SearchEmpty query={search.query.data.query} onClear={() => setSearchText("")} />
            )
          ) : (
            <SearchResults
              data={search.query.data}
              onOpenBoard={(boardId) => router.push(`/board/${boardId}`)}
              onOpenCard={openCard}
            />
          )
        ) : boards.isPending ? (
          <>
            <BoardCardSkeleton />
            <BoardCardSkeleton />
            <BoardCardSkeleton />
          </>
        ) : boards.isError ? (
          <ErrorState onRetry={() => void boards.refetch()} />
        ) : (
          <>
            {boards.data.length === 0 ? (
              <EmptyState
                icon="grid-outline"
                title="لا لوحات"
                message="تظهر هنا اللوحات التي تملكها أو تشارك فيها."
              />
            ) : null}

            {boards.data.length > 0 ? <AllRow boardCount={boards.data.length} onPress={() => router.push("/all-tasks")} /> : null}

            {grouped
              ? sections.map((section) => {
                  const key = section.category?.id ?? "NONE";
                  const open = openSections.has(key);
                  const category = section.category;
                  const manageable = !!category && isCategoryAdmin;
                  return (
                    <View key={key} style={{ gap: spacing.xs }}>
                      <SectionHeader
                        title={category?.name ?? "بلا تصنيف"}
                        color={category ? categoryColor(category.id) : null}
                        open={open}
                        onToggle={() => toggle(key)}
                        onLongPress={
                          manageable ? () => setActionsFor({ ...category, boardCount: section.boards.length }) : undefined
                        }
                      />
                      {!open ? null : section.boards.length > 0 ? (
                        <View>
                          {section.boards.map((board, index) => (
                            <BoardRow
                              key={board.id}
                              board={board}
                              last={index === section.boards.length - 1}
                              onPress={() => openBoard(board)}
                              onShowMembers={() => setMembersOf(board)}
                            />
                          ))}
                        </View>
                      ) : (
                        <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
                          لا لوحات فيه بعد. اختره من «التصنيف» عند إنشاء لوحة أو في إعداداتها.
                        </AppText>
                      )}
                    </View>
                  );
                })
              : sections.flatMap((section) =>
                  section.boards.map((board) => (
                    <BoardRow
                      key={board.id}
                      board={board}
                      branch={false}
                      onPress={() => openBoard(board)}
                      onShowMembers={() => setMembersOf(board)}
                    />
                  )),
                )}

          </>
        )}

        {!search.active && archivedBoards.data && archivedBoards.data.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/archived-boards")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.xs,
              minHeight: MIN_TOUCH_TARGET,
              marginTop: spacing.sm,
            }}
          >
            <AppText size="small" weight="semibold" color={colors.muted}>
              اللوحات المؤرشفة ({archivedBoards.data.length})
            </AppText>
            <Ionicons name="chevron-back" size={14} color={colors.muted} />
          </Pressable>
        ) : null}
      </ScrollView>

      <NewBoardSheet
        visible={creatingBoard}
        onClose={() => setCreatingBoard(false)}
        onCreate={(input) => createBoard.mutate(input)}
        creating={createBoard.isPending}
      />

      <BoardMembersSheet board={membersOf} onClose={() => setMembersOf(null)} />
      <CategoryNameSheet visible={creatingCategory} onClose={() => setCreatingCategory(false)} />
      <CategoryOrderSheet visible={reorderingCategories} onClose={() => setReorderingCategories(false)} />
      <CategoryNameSheet visible={!!renaming} category={renaming ?? undefined} onClose={() => setRenaming(null)} />
      <CategoryActionsSheet
        visible={!!actionsFor}
        category={actionsFor}
        boardCount={actionsFor?.boardCount ?? 0}
        onClose={() => setActionsFor(null)}
        onRename={() => {
          setRenaming(actionsFor);
          setActionsFor(null);
        }}
        onReorder={() => {
          setActionsFor(null);
          setReorderingCategories(true);
        }}
        onDelete={() => {
          setDeleting(actionsFor);
          setActionsFor(null);
        }}
      />
      <ConfirmSheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={`حذف «${deleting?.name ?? ""}»`}
        consequence="يُحذف التصنيف لدى الجميع. لا تُحذف لوحاته، بل تنتقل إلى «بلا تصنيف»."
        confirmLabel="حذف التصنيف"
        confirming={deleteCategory.isPending}
        onConfirm={() => deleting && deleteCategory.mutate(deleting.id)}
      />
    </Screen>
  );
}

/**
 * A category's heading on the boards list — a boxed row with the category's
 * colour tile, so it reads as the root its boards branch from (`BoardRow`
 * draws the trunk under the tile). Tapping anywhere on it folds or unfolds the
 * section; it does not open a page, and shows no board count (the user's
 * decision, 2026-11-12). Long-press (admins only) opens rename/reorder/delete.
 */
function SectionHeader({
  title,
  color,
  open,
  onToggle,
  onLongPress,
}: {
  title: string;
  /** The category's colour; null for «بلا تصنيف», which gets a neutral tile. */
  color: string | null;
  open: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={title}
      accessibilityHint={
        onLongPress
          ? `اضغط ${open ? "لطيّ" : "لفتح"} التصنيف، واضغط مطوّلًا لإعادة التسمية أو الترتيب أو الحذف`
          : `اضغط ${open ? "لطيّ" : "لفتح"} التصنيف`
      }
      onPress={onToggle}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: MIN_TOUCH_TARGET + 8,
        paddingStart: spacing.md,
        paddingEnd: spacing.xs,
        backgroundColor: pressed ? colors.toolbar : colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.row,
        overflow: "hidden",
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: color ?? colors.slateSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={open ? "folder-open" : "folder"} size={15} color={color ? colors.surface : colors.muted} />
      </View>
      <AppText size="title" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </AppText>
      <View
        style={{
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          borderRadius: radii.iconButton,
          backgroundColor: colors.chip,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.slate} />
      </View>
    </Pressable>
  );
}

/**
 * «الكل» — the first row of the boards list, drawn like a category heading
 * (boxed, with a tile): opens `/all-tasks`, one board made of every board's
 * tasks.
 */
function AllRow({ boardCount, onPress }: { boardCount: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`الكل: كل المهام في ${countLabel(boardCount, BOARDS)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: MIN_TOUCH_TARGET + 8,
        paddingStart: spacing.md,
        paddingEnd: spacing.lg,
        backgroundColor: pressed ? colors.toolbar : colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.row,
      })}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="grid" size={14} color={colors.surface} />
      </View>
      <AppText size="title" weight="bold" style={{ flex: 1 }}>
        الكل
      </AppText>
      <View style={{ borderRadius: radii.chip, backgroundColor: colors.chip, paddingHorizontal: spacing.sm, paddingVertical: 1 }}>
        <AppText size="caption" weight="medium" color={colors.muted}>
          {countLabel(boardCount, BOARDS)}
        </AppText>
      </View>
      <Ionicons name="chevron-back" size={16} color={colors.muted} />
    </Pressable>
  );
}

/**
 * The ⋯ beside «+» (admins only): a small menu dropped under it with
 * «تصنيف جديد» and — once there are two categories to order — «ترتيب
 * التصنيفات». Replaces the two links that used to sit under the list.
 */
function CategoriesMenu({
  canReorder,
  onNew,
  onReorder,
}: {
  canReorder: boolean;
  onNew: () => void;
  onReorder: () => void;
}) {
  const buttonRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  function open() {
    buttonRef.current?.measureInWindow((x, y, _width, height) => setAnchor({ top: y + height + 6, left: x }));
  }
  function pick(action: () => void) {
    setAnchor(null);
    action();
  }

  return (
    <>
      <Pressable
        ref={buttonRef}
        accessibilityRole="button"
        accessibilityLabel="خيارات التصنيفات"
        accessibilityState={{ expanded: !!anchor }}
        onPress={open}
        style={({ pressed }) => ({
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          marginStart: spacing.xs,
          borderRadius: radii.field,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: pressed ? colors.canvas : colors.surface,
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.slate} />
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
        <Pressable accessibilityLabel="إغلاق القائمة" style={{ flex: 1 }} onPress={() => setAnchor(null)}>
          {anchor ? (
            <View
              accessibilityRole="menu"
              style={{
                position: "absolute",
                top: anchor.top,
                // `measureInWindow` is physical; under RTL `end` is the physical left edge.
                ...(I18nManager.isRTL ? { end: anchor.left } : { start: anchor.left }),
                width: 224,
                padding: 6,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radii.row,
                shadowColor: colors.ink,
                shadowOpacity: 0.12,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
              }}
            >
              <MenuItem icon="folder-outline" label="تصنيف جديد" onPress={() => pick(onNew)} />
              {canReorder ? <MenuItem icon="swap-vertical-outline" label="ترتيب التصنيفات" onPress={() => pick(onReorder)} /> : null}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: 48,
        paddingHorizontal: spacing.md,
        borderRadius: radii.iconButton,
        backgroundColor: pressed ? colors.canvas : "transparent",
      })}
    >
      <Ionicons name={icon} size={20} color={colors.ink} />
      <AppText weight="semibold">{label}</AppText>
    </Pressable>
  );
}
