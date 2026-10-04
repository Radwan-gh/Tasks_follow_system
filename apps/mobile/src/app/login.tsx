import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { ApiError } from "@app/api-client";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { PrimaryButton } from "@/components/button";
import { useAuth } from "@/features/auth/auth-context";
import { clearSavedCredentials, loadSavedCredentials, saveCredentials } from "@/lib/saved-credentials";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * The API distinguishes bad credentials (401) from a deactivated account (403),
 * and the design gives each its own message — so we branch on the status rather
 * than showing one generic failure.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "هذا الحساب غير مفعّل. راجع مدير النظام.";
    if (error.status === 401) return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  }
  return "تعذّر تسجيل الدخول. تحقّق من اتصالك ثم أعد المحاولة.";
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !isSubmitting;

  // Prefill from «تذكّرني». Functional updates so a read that lands after the
  // user has started typing never clobbers what they typed.
  useEffect(() => {
    let cancelled = false;
    loadSavedCredentials()
      .then((saved) => {
        if (cancelled || !saved) return;
        setUsername((current) => current || saved.username);
        setPassword((current) => current || saved.password);
        setRememberMe(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const credentials = { username: username.trim(), password };
      await login(credentials);
      // Only a successful sign-in is worth remembering; switching it off
      // forgets whatever an earlier sign-in saved. A storage failure must not
      // surface as a login error — the user is already in.
      await (rememberMe ? saveCredentials(credentials) : clearSavedCredentials()).catch(() => undefined);
      // On success the root navigator swaps to the tabs — no navigation here.
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen edges={{ top: true, bottom: true }}>
      {/* `Screen` makes room for the keyboard; a `KeyboardAvoidingView` here
          would double the offset on iOS and do nothing on Android. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require("../../assets/images/logo.png")}
          accessibilityRole="image"
          accessibilityLabel="غِراس"
          resizeMode="contain"
          // Cropped from `logo/ghiras-logo-light.png`; the ratio keeps it sharp
          // at any width without a fixed height to drift out of sync.
          style={{ width: 168, height: undefined, aspectRatio: 1130 / 324, alignSelf: "center", marginBottom: spacing.xxl }}
        />
        <View style={{ gap: spacing.xs, marginBottom: spacing.xxl }}>
          <AppText size="heading" weight="bold">
            تسجيل الدخول
          </AppText>
          <AppText color={colors.muted}>متابعة مهام الفريق ولوحات المشاريع.</AppText>
        </View>

        <View style={{ gap: spacing.lg }}>
          <Field label="اسم المستخدم">
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              editable={!isSubmitting}
              placeholder="username"
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

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="semibold" size="small">
                تذكّرني
              </AppText>
              <AppText size="caption" color={colors.muted}>
                حفظ اسم المستخدم وكلمة المرور على هذا الجهاز
              </AppText>
            </View>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              disabled={isSubmitting}
              trackColor={{ true: colors.accent, false: colors.line }}
              accessibilityLabel="تذكّرني"
            />
          </View>

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
