import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText } from "./text";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/**
 * The design gives every list its own empty copy — "لا لوحات", "لا مهام
 * مُسنَدة", "لا إشعارات" — each a title plus a sentence saying what will
 * appear here. This is that shape, not a generic "no data".
 */
export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  message: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, paddingHorizontal: spacing.xxl, gap: spacing.sm }}>
      <Ionicons name={icon} size={32} color={colors.muted} />
      <AppText weight="semibold" size="title">
        {title}
      </AppText>
      <AppText size="small" color={colors.muted} style={{ textAlign: "center" }}>
        {message}
      </AppText>
    </View>
  );
}

export function ErrorState({
  title = "تعذّر التحميل",
  message = "تحقّق من اتصالك ثم أعد المحاولة.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 56, paddingHorizontal: spacing.xxl, gap: spacing.sm }}>
      <Ionicons name="alert-circle-outline" size={32} color={colors.alert} />
      <AppText weight="semibold" size="title">
        {title}
      </AppText>
      <AppText size="small" color={colors.muted} style={{ textAlign: "center" }}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: "center",
          paddingHorizontal: spacing.xl,
          marginTop: spacing.sm,
          borderRadius: radii.chip,
          backgroundColor: colors.accentSoft,
        }}
      >
        <AppText weight="semibold" size="small" color={colors.accent}>
          إعادة المحاولة
        </AppText>
      </Pressable>
    </View>
  );
}
