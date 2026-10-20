import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Self-service profile edit sheet — `PATCH /auth/me`. Only the first and last
 * name (the server recomposes `displayName` from them):
 * `username` is the login credential of an admin-provisioned account and the
 * email is contact information on it, so both are read-only here and an admin
 * changes them in «المستخدمون والصلاحيات».
 */
export function EditProfileSheet({
  visible,
  firstName: initialFirst,
  lastName: initialLast,
  username,
  email,
  saving,
  error,
  onClose,
  onSave,
}: {
  visible: boolean;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (name: { firstName: string; lastName: string }) => void;
}) {
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);

  // Re-seed each time the sheet opens so a cancelled edit doesn't linger.
  useEffect(() => {
    if (visible) {
      setFirstName(initialFirst);
      setLastName(initialLast);
    }
  }, [visible, initialFirst, initialLast]);

  const first = firstName.trim();
  const last = lastName.trim();
  const canSubmit =
    first.length > 0 && last.length > 0 && (first !== initialFirst || last !== initialLast) && !saving;

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
          الاسم
        </AppText>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            maxLength={50}
            placeholder="الاسم الأول"
            placeholderTextColor={colors.muted}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            maxLength={50}
            placeholder="اسم العائلة"
            placeholderTextColor={colors.muted}
            style={{ ...fieldStyle, flex: 1 }}
          />
        </View>

        <AppText size="small" color={colors.muted}>
          اسم المستخدم
        </AppText>
        <View style={{ ...fieldStyle, backgroundColor: colors.canvas, justifyContent: "center" }}>
          <AppText size="small" color={colors.muted}>
            {username}
          </AppText>
        </View>

        <AppText size="small" color={colors.muted}>
          البريد الإلكتروني
        </AppText>
        <View style={{ ...fieldStyle, backgroundColor: colors.canvas, justifyContent: "center" }}>
          <AppText size="small" color={colors.muted}>
            {email || "—"}
          </AppText>
        </View>
        <AppText size="caption" color={colors.muted}>
          اسم المستخدم هو اسم الدخول، والبريد للتواصل فقط؛ لتغيير أيٍّ منهما راجع المشرف.
        </AppText>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() => onSave({ firstName: first, lastName: last })}
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
