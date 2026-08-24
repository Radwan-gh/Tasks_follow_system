import { RefreshControl, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BoardCardSkeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { BoardCard } from "@/features/boards/board-card";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { colors, spacing } from "@/theme/tokens";

export default function BoardsScreen() {
  const { user } = useAuth();
  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list() });

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: 2 }}>
        <AppText size="small" color={colors.muted}>
          مرحبًا، {user?.displayName ?? ""}
        </AppText>
        <AppText size="heading" weight="bold">
          اللوحات
        </AppText>
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
        ) : boards.data.length === 0 ? (
          <EmptyState
            icon="grid-outline"
            title="لا لوحات"
            message="تظهر هنا اللوحات التي تملكها أو تشارك فيها."
          />
        ) : (
          boards.data.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              isOwner={board.ownerId === user?.id}
              // The board screen arrives with Feature 2; until then a tap is a
              // no-op rather than a route that would 404 at runtime.
              onPress={() => undefined}
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
