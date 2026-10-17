import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * New-user bottom sheet — the design's «ورقة مستخدم جديد» (الاسم · اسم
 * المستخدم · كلمة المرور · مفتاح المشرف).
 *
 * The credential is the **username**; the email is optional contact info, so
 * it gets its own clearly-marked field and is submitted as `null` when blank.
 *
 * `initialName`/`initialUsername` let the admin screen carry whatever was
 * typed into its search box straight into the form: searching for someone who
 * has no account yet is exactly the moment you want to create them, and
 * retyping the handle is the step that made it feel clumsy.
 *
 * `error` is rendered *inside* the sheet rather than on the screen behind it
 * — a duplicate-username rejection shown under the sheet is invisible.
 */
export function NewUserSheet({
  visible,
  onClose,
  onCreate,
  creating,
  initialName = "",
  initialUsername = "",
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: {
    firstName: string;
    lastName: string;
    username: string;
    email: string | null;
    password: string;
    isAdmin: boolean;
  }) => void;
  creating: boolean;
  initialName?: string;
  initialUsername?: string;
  error?: string | null;
}) {
  const [firstName, setFirstName] = useState(() => splitName(initialName).firstName);
  const [lastName, setLastName] = useState(() => splitName(initialName).lastName);
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Seed only as the sheet opens, so typing is never overwritten mid-edit.
  useEffect(() => {
    if (visible) {
      const seeded = splitName(initialName);
      setFirstName(seeded.firstName);
      setLastName(seeded.lastName);
      setUsername(initialUsername);
      setEmail("");
      setPassword("");
      setIsAdmin(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close() {
    setFirstName("");
    setLastName("");
    setUsername("");
    setEmail("");
    setPassword("");
    setIsAdmin(false);
    onClose();
  }

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length >= 8 &&
    !creating;

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
          value={username}
          onChangeText={setUsername}
          placeholder="اسم المستخدم"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          style={fieldStyle}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="البريد الإلكتروني (اختياري)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
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
          onPress={() =>
            onCreate({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              username: username.trim(),
              email: email.trim() || null,
              password,
              isAdmin,
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

/** A typed-in search seeds the name fields: first word → first name, the rest → last name. */
function splitName(name: string): { firstName: string; lastName: string } {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}
