import { useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, radii, spacing } from "@/theme/tokens";

/**
 * The one-time reveal after `POST /admin/users/:id/reset-password`
 * (`design-prompt-group-3.md` §3a-7): the temporary password is never
 * fetchable again after this sheet closes, so it's shown once in a
 * monospace box with a copy button.
 */
export function ResetPasswordResultSheet({
  visible,
  onClose,
  email,
  temporaryPassword,
}: {
  visible: boolean;
  onClose: () => void;
  email: string | null;
  temporaryPassword: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!temporaryPassword) return;
    await Clipboard.setStringAsync(temporaryPassword);
    setCopied(true);
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
    >
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          كلمة المرور المؤقتة
        </AppText>
        {email ? (
          <AppText size="small" color={colors.muted}>
            {email}
          </AppText>
        ) : null}

        <View
          style={{
            borderRadius: radii.field,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.canvas,
            paddingVertical: spacing.lg,
            alignItems: "center",
          }}
        >
          <AppText style={{ fontFamily: fonts.regular, fontSize: 22, letterSpacing: 2 }}>
            {temporaryPassword}
          </AppText>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={copy}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: copied ? colors.accentSoft : colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={copied ? colors.accent : colors.surface}>
            {copied ? "تم النسخ" : "نسخ"}
          </AppText>
        </Pressable>

        <AppText size="caption" color={colors.muted}>
          تُعرض مرة واحدة فقط، وسيُطلب من المستخدم تعيين كلمة مرور جديدة عند أول دخول.
        </AppText>
      </View>
    </BottomSheet>
  );
}
