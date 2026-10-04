import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "@/lib/keyboard";
import { colors, radii } from "@/theme/tokens";

/** Breathing room under the sheet's last control, before the inset or the keyboard. */
const SHEET_BOTTOM_PAD = 20;
/** How much backdrop stays visible above a full-height sheet — the tap-away target. */
const MIN_BACKDROP = 56;
const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * The design's bottom-sheet pattern: dimmed backdrop, rounded top corners,
 * drag handle, tap-outside to dismiss. Built on RN's own `Modal` rather than a
 * gesture-driven library — nothing here needs drag-to-dismiss, only tap-away.
 *
 * The backdrop and the sheet animate separately — the dim *fades* in place
 * while only the sheet slides up. `Modal`'s own `animationType="slide"` moves
 * the whole window, so the dimmed backdrop used to travel up from the bottom
 * of the screen with the sheet, and back down on close. So the `Modal` itself
 * never animates; it stays mounted through the closing animation and is only
 * hidden once the sheet is off-screen.
 *
 * Every sheet with a field in it (new user, new board, التكلفة, تأكيد الحذف…)
 * gets keyboard handling from here rather than repeating it: the sheet is
 * flush with the bottom of the window, so the keyboard's height *is* its
 * overlap — no measuring needed, unlike `Screen`. The window is made
 * edge-to-edge (`statusBarTranslucent`/`navigationBarTranslucent`) to match the
 * app itself, which is what puts that height and `insets` in the same
 * coordinate space. The body scrolls, because a three-field sheet plus a
 * keyboard is taller than the screen.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  scrollable = true,
  onShow,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Fires once the sheet's window is up — the moment a field can take focus and raise the keyboard. */
  onShow?: () => void;
  /** Pass `false` when the body brings its own vertical scroller — two nested ones fight over the gesture. */
  scrollable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  // `mounted` outlives `visible` by the length of the closing animation.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  // Until the sheet has laid out, start it a full window below — off-screen either way.
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    if (visible) setMounted(true);
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      Animated.timing(progress, {
        toValue: visible ? 1 : 0,
        duration: reduceMotion ? 0 : visible ? OPEN_MS : CLOSE_MS,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !visible) setMounted(false);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visible, progress]);

  const offscreen = sheetHeight || windowHeight;

  return (
    <Modal
      visible={mounted}
      animationType="none"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={onShow}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>

      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          style={{
            backgroundColor: colors.surface,
            borderTopStartRadius: radii.sheet,
            borderTopEndRadius: radii.sheet,
            // The keyboard covers the gesture bar, so it replaces the inset.
            paddingBottom: SHEET_BOTTOM_PAD + Math.max(insets.bottom, keyboardHeight),
            // The box still runs to the bottom of the window — the keyboard is
            // already subtracted once, by the padding above — so this only
            // keeps the top of the screen clear.
            maxHeight: Math.max(0, windowHeight - insets.top - MIN_BACKDROP),
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offscreen, 0] }) }],
          }}
        >
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
          </View>
          {scrollable ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
