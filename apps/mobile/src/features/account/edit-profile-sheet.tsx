import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Self-service profile edit sheet — `PATCH /auth/me`. Only the display name:
 * the email is the login identity of an admin-provisioned account, so it is
 * shown read-only here and changed by an admin in «المستخدمون والصلاحيات».
 */
export function EditProfileSheet({
  visible,
  displayName,
  email,
  saving,
  error,
  onClose,
  onSave,
}: {
  visible: boolean;
  displayName: string;
  email: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (displayName: string) => void;
}) {
  const [value, setValue] = useState(displayName);

  // Re-seed each time the sheet opens so a cancelled edit doesn't linger.
  useEffect(() => {
    if (visible) setValue(displayName);
  }, [visible, displayName]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== displayName && !saving;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          تعديل بياناتي
        </AppText>

        {error ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.alert}>
              {error}
            </AppText>
          </View>
        ) : null}

        <AppText size="small" color={colors.muted}>
          الاسم المعروض
        </AppText>
        <TextInput
          value={value}
          onChangeText={setValue}
          maxLength={100}
          placeholder="الاسم"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />

        <AppText size="small" color={colors.muted}>
          البريد الإلكتروني
        </AppText>
        <View style={{ ...fieldStyle, backgroundColor: colors.canvas, justifyContent: "center" }}>
          <AppText size="small" color={colors.muted}>
            {email}
          </AppText>
        </View>
        <AppText size="caption" color={colors.muted}>
          لتغيير البريد الإلكتروني راجع المشرف.
        </AppText>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() => onSave(trimmed)}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canSubmit ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canSubmit ? colors.surface : colors.muted}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const fieldStyle = {
  minHeight: MIN_TOUCH_TARGET,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radii.field,
  paddingHorizontal: spacing.lg,
  fontFamily: fonts.regular,
  fontSize: fontSizes.body,
  color: colors.ink,
  textAlign: "right" as const,
  writingDirection: "rtl" as const,
};
