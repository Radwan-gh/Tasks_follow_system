import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Screen } from "./screen";
import { AppText } from "./text";
import { colors, spacing } from "@/theme/tokens";

/**
 * A tab that exists in the shell but whose feature has not been built yet.
 * Deliberately explicit about which feature will fill it, so a half-built tab
 * never reads as a bug.
 */
export function ComingSoon({
  title,
  note,
  icon,
}: {
  title: string;
  note: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <AppText size="heading" weight="bold">
          {title}
        </AppText>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xxl }}>
        <Ionicons name={icon} size={32} color={colors.muted} />
        <AppText size="small" color={colors.muted} style={{ textAlign: "center" }}>
          {note}
        </AppText>
      </View>
    </Screen>
  );
}
