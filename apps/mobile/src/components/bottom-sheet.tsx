import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "@/lib/keyboard";
import { colors, radii } from "@/theme/tokens";

/** Breathing room under the sheet's last control, before the inset or the keyboard. */
const SHEET_BOTTOM_PAD = 20;
/** How much backdrop stays visible above a full-height sheet — the tap-away target. */
const MIN_BACKDROP = 56;

/**
 * The design's bottom-sheet pattern: dimmed backdrop, rounded top corners,
 * drag handle, tap-outside to dismiss. Built on RN's own `Modal` rather than a
 * gesture-driven library — nothing here needs drag-to-dismiss, only tap-away.
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
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pass `false` when the body brings its own vertical scroller — two nested ones fight over the gesture. */
  scrollable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(35,35,42,0.4)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
