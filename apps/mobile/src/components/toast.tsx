import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Pressable, View } from "react-native";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/** How long a toast stays before dismissing itself — long enough to reach its action. */
const TOAST_MS = 7000;

export interface ToastMessage {
  /** Changes for every new toast, so a second one restarts the timer. */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * A one-line notice after an action that changed something off-screen — the
 * board's "moved to «X» · undo" is what it exists for: a move takes the card
 * out of the column being viewed, so without it nothing says where it went.
 *
 * Placement is the caller's: render it inside a positioned box that sits just
 * above whatever bottom bar the screen has. Screen readers get the message
 * announced, since a toast never takes focus.
 */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility(toast.message);
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart per toast, not per render
  }, [toast?.id]);

  if (!toast) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        opacity: appear,
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.md,
          minHeight: MIN_TOUCH_TARGET,
          backgroundColor: colors.ink,
          borderRadius: radii.field,
          paddingStart: spacing.lg,
          paddingEnd: toast.actionLabel ? spacing.xs : spacing.lg,
        }}
      >
        <AppText size="small" weight="semibold" color={colors.surface} style={{ flex: 1 }} numberOfLines={2}>
          {toast.message}
        </AppText>
        {toast.actionLabel && toast.onAction ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.onAction?.();
              onDismiss();
            }}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.md }}
          >
            <AppText size="small" weight="bold" color={colors.accentSoft}>
              {toast.actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
