import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { ApiError } from "@app/api-client";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { PrimaryButton } from "@/components/button";
import { useAuth } from "@/features/auth/auth-context";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * The API distinguishes bad credentials (401) from a deactivated account (403),
 * and the design gives each its own message — so we branch on the status rather
 * than showing one generic failure.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "هذا الحساب غير مفعّل. راجع مدير النظام.";
    if (error.status === 401) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  }
  return "تعذّر تسجيل الدخول. تحقّق من اتصالك ثم أعد المحاولة.";
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      // On success the root navigator swaps to the tabs — no navigation here.
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.xs, marginBottom: spacing.xxl }}>
            <AppText size="heading" weight="bold">
              تسجيل الدخول
            </AppText>
            <AppText color={colors.muted}>متابعة مهام الفريق ولوحات المشاريع.</AppText>
          </View>

          <View style={{ gap: spacing.lg }}>
            <Field label="البريد الإلكتروني">
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!isSubmitting}
                placeholder="radwan@example.com"
                placeholderTextColor={colors.muted}
                style={inputStyle}
              />
            </Field>

            <Field label="كلمة المرور">
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  editable={!isSubmitting}
                  onSubmitEditing={onSubmit}
                  returnKeyType="go"
                  style={[inputStyle, { flex: 1 }]}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPassword((v) => !v)}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    minWidth: MIN_TOUCH_TARGET,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <AppText size="small" color={colors.accent} weight="medium">
                    {showPassword ? "إخفاء" : "إظهار"}
                  </AppText>
                </Pressable>
              </View>
            </Field>

            {error ? (
              <View
                style={{
                  backgroundColor: colors.alertSoft,
                  borderRadius: radii.field,
                  padding: spacing.md,
                }}
              >
                <AppText size="small" color={colors.alert}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <PrimaryButton
              label={isSubmitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
              onPress={onSubmit}
              disabled={!canSubmit}
              loading={isSubmitting}
            />

            <AppText size="small" color={colors.muted} style={{ textAlign: "center" }}>
              لإنشاء حساب جديد، تواصل مع مدير النظام.
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="small" color={colors.muted}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

const inputStyle = {
  minHeight: MIN_TOUCH_TARGET,
  borderRadius: radii.field,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.line,
  paddingHorizontal: spacing.lg,
  fontFamily: fonts.regular,
  fontSize: fontSizes.body,
  color: colors.ink,
  textAlign: "right",
  writingDirection: "rtl",
} as const;
