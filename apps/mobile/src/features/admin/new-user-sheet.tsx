import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * New-user bottom sheet — the design's «ورقة مستخدم جديد» (الاسم · البريد ·
 * كلمة المرور · مفتاح المشرف).
 *
 * `initialName`/`initialEmail` let the admin screen carry whatever was typed
 * into its search box straight into the form: searching for someone who has
 * no account yet is exactly the moment you want to create them, and retyping
 * the address is the step that made it feel clumsy.
 *
 * `error` is rendered *inside* the sheet rather than on the screen behind it
 * — a duplicate-email rejection shown under the sheet is invisible.
 */
export function NewUserSheet({
  visible,
  onClose,
  onCreate,
  creating,
  initialName = "",
  initialEmail = "",
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { displayName: string; email: string; password: string; isAdmin: boolean }) => void;
  creating: boolean;
  initialName?: string;
  initialEmail?: string;
  error?: string | null;
}) {
  const [displayName, setDisplayName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Seed only as the sheet opens, so typing is never overwritten mid-edit.
  useEffect(() => {
    if (visible) {
      setDisplayName(initialName);
      setEmail(initialEmail);
      setPassword("");
      setIsAdmin(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close() {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setIsAdmin(false);
    onClose();
  }

  const canSubmit = displayName.trim().length > 0 && email.trim().length > 0 && password.length >= 8 && !creating;

  return (
    <BottomSheet visible={visible} onClose={close}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          مستخدم جديد
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
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="كلمة المرور (8 أحرف على الأقل)"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={fieldStyle}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isAdmin }}
          onPress={() => setIsAdmin((v) => !v)}
          style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: isAdmin ? colors.accent : "transparent",
              borderWidth: isAdmin ? 0 : 1.5,
              borderColor: colors.line,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isAdmin ? (
              <AppText size="caption" color={colors.surface}>
                ✓
              </AppText>
            ) : null}
          </View>
          <AppText weight="semibold" size="small">
            مشرف
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() => onCreate({ displayName: displayName.trim(), email: email.trim(), password, isAdmin })}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canSubmit ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canSubmit ? colors.surface : colors.muted}>
            {creating ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
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
