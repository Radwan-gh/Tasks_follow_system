import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardTemplate } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BoardCardSkeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { BoardCard } from "@/features/boards/board-card";
import { NewBoardSheet } from "@/features/boards/new-board-sheet";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, spacing } from "@/theme/tokens";

export default function BoardsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list() });
  const [creatingBoard, setCreatingBoard] = useState(false);

  const createBoard = useMutation({
    mutationFn: (input: { name: string; template: BoardTemplate; dueDate: string | null }) =>
      api.boards.create({ name: input.name, template: input.template, dueDate: input.dueDate }),
    onSuccess: (board) => {
      setCreatingBoard(false);
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      router.push(`/board/${board.id}`);
    },
  });

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
              onPress={() => router.push(`/board/${board.id}`)}
            />
          ))
        )}
      </ScrollView>

      <NewBoardSheet
        visible={creatingBoard}
        onClose={() => setCreatingBoard(false)}
        onCreate={(input) => createBoard.mutate(input)}
        creating={createBoard.isPending}
      />
    </Screen>
  );
}
