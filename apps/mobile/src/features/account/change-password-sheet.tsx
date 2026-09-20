import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ApiError } from "@app/api-client";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** Mirrors `ChangePasswordRequestSchema.newPassword`'s minimum in `packages/types`. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Voluntary self-service password change — `POST /auth/change-password`.
 * Unlike the forced "عيّن كلمة مرور جديدة" screen, the current password is
 * asked for: nothing was typed at sign-in moments ago to reuse. The session
 * survives the change because `AuthProvider.changePassword` signs in again.
 */
export function ChangePasswordSheet({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start blank each time — passwords must not linger after a cancelled attempt.
  useEffect(() => {
    if (visible) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
    }
  }, [visible]);

  const canSubmit = !!currentPassword && !!newPassword && !!confirmPassword && !saving;

  async function submit() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError("كلمة المرور الحالية غير صحيحة.");
      else setError(err instanceof ApiError ? err.message : "تعذّر تغيير كلمة المرور");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={saving ? () => undefined : onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          تغيير كلمة المرور
        </AppText>

        {error ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.alert}>
              {error}
            </AppText>
          </View>
        ) : null}

        <AppText size="small" color={colors.muted}>
          كلمة المرور الحالية
        </AppText>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />

        <AppText size="small" color={colors.muted}>
          كلمة المرور الجديدة
        </AppText>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          placeholder="8 أحرف على الأقل"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />

        <AppText size="small" color={colors.muted}>
          تأكيد كلمة المرور الجديدة
        </AppText>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          placeholder="أعد كتابة كلمة المرور"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />
        <AppText size="caption" color={colors.muted}>
          سيُسجَّل خروجك من أجهزتك الأخرى بعد التغيير.
        </AppText>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={submit}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canSubmit ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canSubmit ? colors.surface : colors.muted}>
            {saving ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
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
