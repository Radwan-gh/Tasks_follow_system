import { useRef, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardOverlap } from "@/lib/keyboard";
import { colors } from "@/theme/tokens";

/**
 * The canvas every screen sits on. Applies the top inset itself rather than
 * using `SafeAreaView`, so a screen can still paint edge-to-edge below the
 * status bar (the board's status tabs do).
 *
 * It also makes room for the software keyboard, for every screen at once: the
 * canvas shrinks by however much of it the keyboard covers, so a bottom bar
 * (the board's quick-add) rides up and a `ScrollView` inside gets shorter —
 * which is what lets Android scroll the focused field back into view. Nothing
 * else in the app should reach for `KeyboardAvoidingView`; on Android's
 * edge-to-edge window it does nothing (see `lib/keyboard.ts`).
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
  const ref = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(ref);

  return (
    <View
      ref={ref}
      style={[
        {
          flex: 1,
          backgroundColor: colors.canvas,
          paddingTop: edges.top ? insets.top : 0,
          // The keyboard already covers the gesture bar, so it replaces the
          // bottom inset rather than stacking on top of it.
          paddingBottom: Math.max(edges.bottom ? insets.bottom : 0, keyboardOverlap),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
