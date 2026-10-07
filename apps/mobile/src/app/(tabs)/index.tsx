import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageBoardCategories, groupBoardsByCategory, type BoardSummary } from "@app/types";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BoardCardSkeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { BoardCard } from "@/features/boards/board-card";
import {
  BOARD_CATEGORIES_KEY,
  CategoryActionsSheet,
  CategoryNameSheet,
  CategoryOrderSheet,
  useBoardCategories,
} from "@/features/boards/board-categories";
import { BoardRow } from "@/features/boards/board-row";
import { NewBoardSheet } from "@/features/boards/new-board-sheet";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { BOARDS, countLabel } from "@/lib/plural";
import { MIN_TOUCH_TARGET, colors, spacing } from "@/theme/tokens";

export default function BoardsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list() });
  const archivedBoards = useQuery({ queryKey: ["boards", "archived"], queryFn: () => api.boards.listArchived() });
  const categories = useBoardCategories();
  const [creatingBoard, setCreatingBoard] = useState(false);
  // Section keys: a category id, or `NONE` for «بلا تصنيف». In memory only — a
  // fresh launch shows everything expanded.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [reorderingCategories, setReorderingCategories] = useState(false);
  const [actionsFor, setActionsFor] = useState<{ id: string; name: string; boardCount: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  // Creating, renaming and deleting categories is admin-only; admins also see
  // the empty ones, which they're presumably about to fill.
  const isCategoryAdmin = !!user && canManageBoardCategories(user);
  const sections = useMemo(
    () =>
      boards.data ? groupBoardsByCategory(boards.data, categories.data ?? [], { includeEmpty: isCategoryAdmin }) : [],
    [boards.data, categories.data, isCategoryAdmin],
  );
  const grouped = sections.some((s) => s.category !== null);

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
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

  function boardCard(board: BoardSummary) {
    return <BoardCard key={board.id} board={board} isOwner={board.ownerId === user?.id} onPress={() => openBoard(board)} />;
  }

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.xl,
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
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md }}
        refreshControl={
          <RefreshControl refreshing={boards.isRefetching} onRefresh={() => void boards.refetch()} />
        }
      >
        {boards.isPending ? (
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

            {grouped
              ? sections.map((section) => {
                  const key = section.category?.id ?? "NONE";
                  const open = !collapsed.has(key);
                  const category = section.category;
                  const manageable = !!category && isCategoryAdmin;
                  return (
                    <View key={key} style={{ gap: spacing.sm }}>
                      <SectionHeader
                        title={category?.name ?? "بلا تصنيف"}
                        count={section.boards.length}
                        open={open}
                        onPress={() => toggle(key)}
                        onLongPress={
                          manageable ? () => setActionsFor({ ...category, boardCount: section.boards.length }) : undefined
                        }
                      />
                      {!open ? null : !category ? (
                        section.boards.map(boardCard)
                      ) : section.boards.length > 0 ? (
                        section.boards.map((board) => (
                          <BoardRow key={board.id} board={board} onPress={() => openBoard(board)} />
                        ))
                      ) : (
                        <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
                          لا لوحات فيه بعد. اختره من «التصنيف» عند إنشاء لوحة أو في إعداداتها.
                        </AppText>
                      )}
                    </View>
                  );
                })
              : sections.flatMap((section) => section.boards.map(boardCard))}

            {isCategoryAdmin ? (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.xl }}>
                <FooterAction label="+ تصنيف جديد" onPress={() => setCreatingCategory(true)} />
                {(categories.data?.length ?? 0) > 1 ? (
                  <FooterAction label="ترتيب التصنيفات" onPress={() => setReorderingCategories(true)} />
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {archivedBoards.data && archivedBoards.data.length > 0 ? (
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
 * A category's heading on the boards list — tap folds it, long-press (admins
 * only) opens rename/reorder/delete.
 */
function SectionHeader({
  title,
  count,
  open,
  onPress,
  onLongPress,
}: {
  title: string;
  count: number;
  open: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}، ${countLabel(count, BOARDS)}`}
      accessibilityHint={onLongPress ? "اضغط للطي أو الفتح، واضغط مطوّلًا لإعادة التسمية أو الترتيب أو الحذف" : "اضغط للطي أو الفتح"}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: spacing.xs,
        marginTop: spacing.xs,
      }}
    >
      <Ionicons name="folder-outline" size={15} color={colors.muted} />
      <AppText size="small" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      <AppText size="caption" color={colors.muted}>
        {countLabel(count, BOARDS)}
      </AppText>
      <View style={{ flex: 1 }} />
      <Ionicons name={open ? "chevron-down" : "chevron-back"} size={15} color={colors.muted} />
    </Pressable>
  );
}

function FooterAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", justifyContent: "center", minHeight: MIN_TOUCH_TARGET }}
    >
      <AppText weight="semibold" color={colors.muted}>
        {label}
      </AppText>
    </Pressable>
  );
}
