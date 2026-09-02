import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** New-user bottom sheet — the design's «ورقة مستخدم جديد» (الاسم · البريد · كلمة المرور · مفتاح المشرف). */
export function NewUserSheet({
  visible,
  onClose,
  onCreate,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { displayName: string; email: string; password: string; isAdmin: boolean }) => void;
  creating: boolean;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

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
