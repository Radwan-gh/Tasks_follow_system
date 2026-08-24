import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";

/**
 * The canvas every screen sits on. Applies the top inset itself rather than
 * using `SafeAreaView`, so a screen can still paint edge-to-edge below the
 * status bar (the board's status tabs do).
 */
export function Screen({
  children,
  style,
  edges = { top: true, bottom: false },
}: {
  children: ReactNode;
  style?: ViewStyle;
  edges?: { top?: boolean; bottom?: boolean };
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.canvas,
          paddingTop: edges.top ? insets.top : 0,
          paddingBottom: edges.bottom ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
