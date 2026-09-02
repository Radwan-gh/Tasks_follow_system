import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { NotificationPrefsSection } from "@/features/account/notification-prefs-section";
import { useAuth } from "@/features/auth/auth-context";
import { initials } from "@/lib/initials";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function onLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg }}>
        <AppText size="heading" weight="bold">
          حسابي
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.card,
            borderWidth: 1,
            borderColor: colors.line,
            padding: spacing.xl,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radii.chip,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="bold" color={colors.accent}>
              {initials(user?.displayName ?? "")}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText weight="semibold" size="title">
              {user?.displayName}
            </AppText>
            <AppText size="small" color={colors.muted}>
              {user?.email}
            </AppText>
          </View>
          {user?.role === "ADMIN" ? (
            <View
              style={{
                borderRadius: radii.chip,
                backgroundColor: colors.accentSoft,
                paddingHorizontal: spacing.md,
                paddingVertical: 2,
              }}
            >
              <AppText size="caption" weight="medium" color={colors.accent}>
                مشرف
              </AppText>
            </View>
          ) : null}
        </View>

        <NotificationPrefsSection />

        {user?.role === "ADMIN" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/admin/users")}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              borderRadius: radii.field,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surface,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText weight="semibold">المستخدمون والصلاحيات</AppText>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          disabled={isLoggingOut}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={colors.alert}>
            {isLoggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
