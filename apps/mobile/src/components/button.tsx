import { ActivityIndicator, Pressable, type ViewStyle } from "react-native";
import { AppText } from "./text";
import { MIN_TOUCH_TARGET, colors, radii } from "@/theme/tokens";

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: radii.field,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
          backgroundColor: inactive ? colors.line : colors.accent,
          opacity: pressed && !inactive ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <AppText weight="semibold" color={inactive ? colors.muted : colors.surface}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}
