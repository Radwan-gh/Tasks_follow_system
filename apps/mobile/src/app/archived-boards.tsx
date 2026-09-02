import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BoardCardSkeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { BoardCard } from "@/features/boards/board-card";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, spacing } from "@/theme/tokens";

/**
 * `/archived-boards` — the boards list's collapsed "اللوحات المؤرشفة (n) ›"
 * link, expanded to its own read-only list screen — `design-prompt-group-3.md`
 * §3b-3.
 */
export default function ArchivedBoardsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const boards = useQuery({ queryKey: ["boards", "archived"], queryFn: () => api.boards.listArchived() });

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
        <AppText size="title" weight="bold">
          اللوحات المؤرشفة
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md }}>
        {boards.isPending ? (
          <>
            <BoardCardSkeleton />
            <BoardCardSkeleton />
          </>
        ) : boards.isError ? (
          <ErrorState onRetry={() => void boards.refetch()} />
        ) : boards.data.length === 0 ? (
          <EmptyState icon="archive-outline" title="لا لوحات مؤرشفة" message="اللوحات التي تؤرشفها تظهر هنا." />
        ) : (
          boards.data.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              isOwner={board.ownerId === user?.id}
              archived
              onPress={() => router.push(`/board/${board.id}`)}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
