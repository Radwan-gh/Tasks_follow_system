import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * The design's unified confirm dialog (`design-prompt-group-3.md` §3a-6):
 * title, a consequence line, "إلغاء" (neutral) over a red destructive action.
 * Replaces every ad-hoc two-tap "tap again to confirm" button built before
 * this component existed (delete card, remove member, archive board, …).
 *
 * `typeToConfirm` renders the harsher variant (board deletion): the action
 * button stays disabled until the typed text exactly matches it.
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  confirming,
  typeToConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  consequence: string;
  confirmLabel: string;
  onConfirm: () => void;
  confirming?: boolean;
  typeToConfirm?: string;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (visible) setTyped("");
  }, [visible]);

  const canConfirm = !confirming && (!typeToConfirm || typed === typeToConfirm);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          {title}
        </AppText>
        <AppText color={colors.muted}>{consequence}</AppText>

        {typeToConfirm ? (
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={typeToConfirm}
            placeholderTextColor={colors.muted}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radii.field,
              paddingHorizontal: spacing.lg,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: colors.canvas,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold">إلغاء</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canConfirm}
          onPress={onConfirm}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: colors.alert,
            alignItems: "center",
            justifyContent: "center",
            opacity: canConfirm ? 1 : 0.5,
          }}
        >
          <AppText weight="semibold" color={colors.surface}>
            {confirming ? "جارٍ التنفيذ..." : confirmLabel}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
