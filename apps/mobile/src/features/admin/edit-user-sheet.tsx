import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { AdminUser, UpdateUserRequest } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Admin edit sheet for a user's identity fields — `PATCH /admin/users/:id`.
 * Role, status, permissions and passwords keep their own row actions, so this
 * sheet only carries the display name and the login email. Only changed fields
 * are sent: an email change revokes the target's sessions server-side, and a
 * rename alone must not.
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
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  // Re-seed whenever a different row opens the sheet.
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setEmail(user.email);
    }
  }, [user]);

  const trimmedName = displayName.trim();
  const trimmedEmail = email.trim();
  const nameChanged = !!user && trimmedName !== user.displayName;
  const emailChanged = !!user && trimmedEmail !== user.email;
  const canSubmit =
    trimmedName.length > 0 && trimmedEmail.length > 0 && (nameChanged || emailChanged) && !saving;

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

        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={100}
          placeholder="الاسم"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="البريد الإلكتروني"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={fieldStyle}
        />

        {emailChanged ? (
          <AppText size="caption" color={colors.muted}>
            تغيير البريد الإلكتروني يغيّر بيانات تسجيل دخول المستخدم وينهي جلساته الحالية.
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() =>
            onSave({
              ...(nameChanged ? { displayName: trimmedName } : {}),
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
