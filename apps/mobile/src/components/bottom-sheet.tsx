import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii } from "@/theme/tokens";

/**
 * The design's bottom-sheet pattern: dimmed backdrop, rounded top corners,
 * drag handle, tap-outside to dismiss. Built on RN's own `Modal` rather than a
 * gesture-driven library — nothing here needs drag-to-dismiss, only tap-away.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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
            paddingBottom: 20 + insets.bottom,
          }}
        >
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View style={{ width: 44, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
