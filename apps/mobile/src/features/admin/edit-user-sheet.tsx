import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { AdminUser, UpdateUserRequest } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Admin edit sheet for a user's descriptive fields — `PATCH /admin/users/:id`.
 * Role, status, permissions and passwords keep their own row actions, and
 * `username` is the login credential and never editable, so this sheet only
 * carries the first/last name (the server recomposes `displayName` from them)
 * and the (optional) contact email. Only changed
 * fields are sent, and an emptied email is sent as `""` to clear it.
 */
export function EditUserSheet({
  user,
  saving,
  error,
  onClose,
  onSave,
}: {
  user: AdminUser | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: UpdateUserRequest) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Re-seed whenever a different row opens the sheet.
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email ?? "");
    }
  }, [user]);

  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();
  const trimmedEmail = email.trim();
  const firstChanged = !!user && trimmedFirst !== user.firstName;
  const lastChanged = !!user && trimmedLast !== user.lastName;
  const emailChanged = !!user && trimmedEmail !== (user.email ?? "");
  const canSubmit =
    trimmedFirst.length > 0 &&
    trimmedLast.length > 0 &&
    (firstChanged || lastChanged || emailChanged) &&
    !saving;

  return (
    <BottomSheet visible={!!user} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          تعديل بيانات المستخدم
        </AppText>

        {error ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.alert}>
              {error}
            </AppText>
          </View>
        ) : null}

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
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="البريد الإلكتروني (اختياري)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={fieldStyle}
        />

        <AppText size="caption" color={colors.muted}>
          اسم الدخول «{user?.username}» لا يمكن تعديله. البريد للتواصل فقط، واتركه فارغًا لإزالته.
        </AppText>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() =>
            onSave({
              ...(firstChanged ? { firstName: trimmedFirst } : {}),
              ...(lastChanged ? { lastName: trimmedLast } : {}),
              ...(emailChanged ? { email: trimmedEmail } : {}),
            })
          }
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canSubmit ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canSubmit ? colors.surface : colors.muted}>
            {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
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
