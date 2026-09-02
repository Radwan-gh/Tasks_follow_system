import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { ApiError } from "@app/api-client";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * Forced after logging in with an admin-issued temporary password
 * (`design-prompt-group-3.md` §3a-7). `_layout.tsx`'s `RootNavigator` routes
 * here instead of the tabs whenever `user.mustChangePassword` is true, and
 * there is no way back except completing this form.
 */
export default function ChangePasswordRequiredScreen() {
  const { completePasswordReset } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (newPassword.length < 8) {
      setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await completePasswordReset(newPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.lg }}>
      <AppText weight="bold" size="title">
        عيّن كلمة مرور جديدة
      </AppText>
      <AppText color={colors.muted}>
        سجّلت الدخول بكلمة مرور مؤقتة. اختر كلمة مرور جديدة للمتابعة.
      </AppText>

      {error ? (
        <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
          <AppText size="small" color={colors.alert}>
            {error}
          </AppText>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText size="caption" weight="semibold" color={colors.muted}>
          كلمة المرور الجديدة
        </AppText>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="8 أحرف على الأقل"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText size="caption" weight="semibold" color={colors.muted}>
          تأكيد كلمة المرور
        </AppText>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="أعد كتابة كلمة المرور"
          placeholderTextColor={colors.muted}
          style={fieldStyle}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={saving || !newPassword || !confirmPassword}
        onPress={submit}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: radii.field,
          backgroundColor: saving || !newPassword || !confirmPassword ? colors.line : colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AppText weight="semibold" color={colors.surface}>
          {saving ? "جارٍ الحفظ..." : "حفظ والمتابعة"}
        </AppText>
      </Pressable>
    </Screen>
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
