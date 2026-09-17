import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import { canSendPush } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { CurrencySettingSection } from "@/features/account/currency-setting-section";
import { EditProfileSheet } from "@/features/account/edit-profile-sheet";
import { NotificationPrefsSection } from "@/features/account/notification-prefs-section";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { initials } from "@/lib/initials";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

export default function AccountScreen() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Self-service edit of the user's own display name (`PATCH /auth/me`); the
  // context is re-read afterwards so the header and avatar update at once.
  const updateProfile = useMutation({
    mutationFn: async (displayName: string) => {
      await api.auth.updateProfile({ displayName });
      await refreshUser();
    },
    onSuccess: () => {
      setEditingProfile(false);
      setProfileError(null);
    },
    onError: (err) => setProfileError(err instanceof ApiError ? err.message : "تعذّر حفظ البيانات"),
  });

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تعديل بياناتي"
          onPress={() => {
            setProfileError(null);
            setEditingProfile(true);
          }}
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
              {user?.username}
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
          <AppText size="small" color={colors.accent}>
            تعديل
          </AppText>
        </Pressable>

        <NotificationPrefsSection />

        {user?.role === "ADMIN" ? <CurrencySettingSection /> : null}

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

        {user && canSendPush(user) ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/push")}
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
            <AppText weight="semibold">إرسال إشعار</AppText>
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

      <EditProfileSheet
        visible={editingProfile}
        displayName={user?.displayName ?? ""}
        username={user?.username ?? ""}
        email={user?.email ?? ""}
        saving={updateProfile.isPending}
        error={profileError}
        onClose={() => {
          setEditingProfile(false);
          setProfileError(null);
        }}
        onSave={(displayName) => updateProfile.mutate(displayName)}
      />
    </Screen>
  );
}
