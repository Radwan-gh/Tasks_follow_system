import { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors, radii } from "@/theme/tokens";

/**
 * A pulsing placeholder block. The design replaces every «جارٍ التحميل...»
 * string with skeletons of the shape of the content that is coming, so the
 * layout does not jump when data lands.
 */
export function Skeleton({ width, height, radius = 8, style }: {
  width?: ViewStyle["width"];
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width: width ?? "100%", height, borderRadius: radius, backgroundColor: colors.line }, animated, style]}
    />
  );
}

/** The boards list's loading state: three cards' worth of skeleton. */
export function BoardCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 20,
        gap: 12,
      }}
    >
      <Skeleton width="55%" height={18} />
      <Skeleton width="80%" height={13} />
      <Skeleton height={8} radius={999} />
    </View>
  );
}
