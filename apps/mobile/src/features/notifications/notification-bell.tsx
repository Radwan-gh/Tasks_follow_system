import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors } from "@/theme/tokens";

/**
 * The bell + unread badge in "اللوحات"/"مهامي"'s headers
 * (`design-prompt-group-3.md` §3a-1). Polled via TanStack Query rather than
 * push — this project has no OS push infrastructure (`apps/mobile/TASKS.md`).
 */
export function NotificationBell() {
  const router = useRouter();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.list(),
    refetchInterval: 30_000,
  });

  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="الإشعارات"
      onPress={() => router.push("/notifications")}
      style={{
        width: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="notifications-outline" size={22} color={colors.ink} />
      {unreadCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 8,
            insetInlineEnd: 8,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 3,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText size="caption" weight="bold" color={colors.surface} style={{ fontSize: 9, lineHeight: 11 }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
