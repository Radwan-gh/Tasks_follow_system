import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification, NotificationType } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { api } from "@/lib/api";
import { colors, spacing } from "@/theme/tokens";

const ICONS: Record<NotificationType, string> = {
  ASSIGNED: "◍",
  DUE_SOON: "◷",
  OVERDUE: "◷",
  COMMENT: "💬",
  CARD_CLOSED: "✓",
};

/**
 * `/notifications` — the design's مركز الإشعارات (§3a-1): title + "تحديد
 * الكل كمقروء"، grouped اليوم/أمس/أقدم، tap opens the card and marks it read.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api.notifications.list() });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  const markRead = useMutation({ mutationFn: (id: string) => api.notifications.markRead(id), onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: () => api.notifications.markAllRead(), onSuccess: invalidate });

  function open(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.cardId) router.push(`/card/${notification.cardId}`);
  }

  const groups = notifications.data ? groupByRecency(notifications.data.items) : null;

  return (
    <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: colors.surface }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <AppText color={colors.muted}>إغلاق</AppText>
        </Pressable>
        <AppText weight="bold">الإشعارات</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => markAllRead.mutate()}
          disabled={!notifications.data?.unreadCount}
          hitSlop={8}
        >
          <AppText size="small" weight="semibold" color={notifications.data?.unreadCount ? colors.accent : colors.muted}>
            تحديد الكل كمقروء
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}>
        {notifications.isPending ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={56} radius={16} />
            <Skeleton height={56} radius={16} />
            <Skeleton height={56} radius={16} />
          </View>
        ) : notifications.isError ? (
          <ErrorState onRetry={() => void notifications.refetch()} />
        ) : notifications.data.items.length === 0 ? (
          <EmptyState icon="notifications-outline" title="لا إشعارات" message="يصلك هنا كل ما يخصّ مهامك." />
        ) : (
          groups!.map(
            (group) =>
              group.items.length > 0 && (
                <View key={group.label} style={{ gap: spacing.sm }}>
                  <AppText size="small" weight="bold" color={colors.muted}>
                    {group.label}
                  </AppText>
                  <View style={{ gap: spacing.sm }}>
                    {group.items.map((n) => (
                      <NotificationRow key={n.id} notification={n} onPress={() => open(n)} />
                    ))}
                  </View>
                </View>
              ),
          )
        )}
      </ScrollView>
    </Screen>
  );
}

function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const isOverdueType = notification.type === "OVERDUE";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.md,
        backgroundColor: colors.canvas,
        borderRadius: 16,
        padding: spacing.md,
      }}
    >
      <AppText size="title" color={isOverdueType ? colors.alert : colors.muted}>
        {ICONS[notification.type]}
      </AppText>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size="small" style={{ lineHeight: 20 }} numberOfLines={2}>
          {describeNotification(notification)}
        </AppText>
        <AppText size="caption" color={colors.muted}>
          {new Date(notification.createdAt).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}
        </AppText>
      </View>
      {!notification.readAt ? (
        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.accent, marginTop: 4 }} />
      ) : null}
    </Pressable>
  );
}

function describeNotification(n: Notification): string {
  const title = typeof n.payload?.cardTitle === "string" ? n.payload.cardTitle : "مهمة";
  switch (n.type) {
    case "ASSIGNED":
      return `أُسندت إليك: ${title}`;
    case "DUE_SOON":
      return `موعد «${title}» يقترب`;
    case "OVERDUE":
      return `تأخّرت مهمة «${title}»`;
    case "COMMENT":
      return `تعليق جديد على «${title}»`;
    case "CARD_CLOSED":
      return `نُقلت «${title}» إلى «انتهى»`;
    default:
      return title;
  }
}

function groupByRecency(items: Notification[]): { label: string; items: Notification[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const older: Notification[] = [];
  for (const item of items) {
    const createdAt = new Date(item.createdAt);
    if (createdAt >= startOfToday) today.push(item);
    else if (createdAt >= startOfYesterday) yesterday.push(item);
    else older.push(item);
  }
  return [
    { label: "اليوم", items: today },
    { label: "أمس", items: yesterday },
    { label: "أقدم", items: older },
  ];
}
