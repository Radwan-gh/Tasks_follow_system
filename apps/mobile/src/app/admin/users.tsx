import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import type { AdminUser, UserRole } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { Skeleton } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/state-views";
import { NewUserSheet } from "@/features/admin/new-user-sheet";
import { ResetPasswordResultSheet } from "@/features/admin/reset-password-result-sheet";
import { useAuth } from "@/features/auth/auth-context";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

const PAGE_SIZE = 20;

/**
 * `/admin/users` — the design's «المستخدمون والصلاحيات على الجوال»: rows
 * instead of a table, role/status badges, a "+" opening `NewUserSheet`, and
 * `window.prompt`/`window.confirm` from the web version replaced by sheets
 * and inline two-tap confirms (`v2-new-style.md` §7.2's own implementation
 * note). Reachable only from «حسابي» for `ADMIN` users; the real gate is
 * still server-side `AdminGuard` on every one of these endpoints.
 */
export default function AdminUsersScreen() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [resettingTarget, setResettingTarget] = useState<AdminUser | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [confirming, setConfirming] = useState<{ userId: string; action: "role" | "status" } | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const users = useQuery({
    queryKey: ["admin-users", debouncedSearch, page],
    queryFn: () => api.admin.listUsers({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  function reportError(err: unknown) {
    setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع");
  }
  function invalidate() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }

  const createUser = useMutation({
    mutationFn: (input: { displayName: string; email: string; password: string; isAdmin: boolean }) =>
      api.admin.createUser({
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        role: input.isAdmin ? "ADMIN" : "USER",
      }),
    onSuccess: () => {
      setCreatingUser(false);
      invalidate();
    },
    onError: reportError,
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => api.admin.resetPassword(id),
    onSuccess: (result) => {
      if (resettingTarget) setResetResult({ email: resettingTarget.email, temporaryPassword: result.temporaryPassword });
      setResettingTarget(null);
      invalidate();
    },
    onError: (err) => {
      setResettingTarget(null);
      reportError(err);
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: { id: string; role: UserRole }) => api.admin.updateUserRole(input.id, input.role),
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
    onError: reportError,
  });

  const updateStatus = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => api.admin.updateUserStatus(input.id, input.isActive),
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
    onError: reportError,
  });

  const isMutating = updateRole.isPending || updateStatus.isPending;
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;

  return (
    <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: colors.surface }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <AppText color={colors.muted}>إلغاء</AppText>
        </Pressable>
        <AppText weight="bold">المستخدمون والصلاحيات</AppText>
        <Pressable accessibilityRole="button" onPress={() => setCreatingUser(true)} hitSlop={8}>
          <AppText size="title" weight="bold" color={colors.accent}>
            +
          </AppText>
        </Pressable>
      </View>

      <View style={{ padding: spacing.xl, paddingBottom: spacing.md }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث بالبريد الإلكتروني أو الاسم"
          placeholderTextColor={colors.muted}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.lg,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md }}>
        {error ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.alert}>
              {error}
            </AppText>
          </View>
        ) : null}

        {users.isPending ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={72} radius={radii.card} />
            <Skeleton height={72} radius={radii.card} />
          </View>
        ) : users.isError ? (
          <ErrorState onRetry={() => void users.refetch()} />
        ) : users.data.users.length === 0 ? (
          <EmptyState icon="people-outline" title="لا نتائج" message="لا يوجد مستخدمون يطابقون بحثك." />
        ) : (
          users.data.users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            const palette = avatarColorFor(u.id);
            const confirmingRole = confirming?.userId === u.id && confirming.action === "role";
            const confirmingStatus = confirming?.userId === u.id && confirming.action === "status";

            return (
              <View
                key={u.id}
                style={{
                  backgroundColor: colors.canvas,
                  borderRadius: radii.card,
                  padding: spacing.lg,
                  gap: spacing.md,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      backgroundColor: palette.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText weight="bold" color={palette.fg}>
                      {initials(u.displayName)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText weight="semibold">
                      {u.displayName}
                      {isSelf ? (
                        <AppText size="caption" color={colors.muted}>
                          {" "}
                          (أنت)
                        </AppText>
                      ) : null}
                    </AppText>
                    <AppText size="small" color={colors.muted}>
                      {u.email}
                    </AppText>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
                  <Badge
                    label={u.role === "ADMIN" ? "مشرف" : "مستخدم"}
                    background={u.role === "ADMIN" ? colors.ink : colors.line}
                    color={u.role === "ADMIN" ? colors.surface : colors.muted}
                  />
                  <Badge
                    label={u.isActive ? "نشط" : "غير مفعّل"}
                    background={u.isActive ? "#E6F4EE" : colors.alertSoft}
                    color={u.isActive ? "#1F7A5C" : colors.alert}
                  />
                  <AppText size="caption" color={colors.muted}>
                    {u.boardCount} لوحة
                  </AppText>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                  <ActionButton
                    label={confirmingRole ? "تأكيد" : u.role === "ADMIN" ? "خفض إلى مستخدم" : "تعيين كمشرف"}
                    danger={confirmingRole}
                    disabled={isSelf || isMutating}
                    onPress={() =>
                      confirmingRole
                        ? updateRole.mutate({ id: u.id, role: u.role === "ADMIN" ? "USER" : "ADMIN" })
                        : setConfirming({ userId: u.id, action: "role" })
                    }
                  />
                  <ActionButton
                    label={confirmingStatus ? "تأكيد" : u.isActive ? "إلغاء التفعيل" : "إعادة التفعيل"}
                    danger={confirmingStatus}
                    disabled={isSelf || isMutating}
                    onPress={() =>
                      confirmingStatus
                        ? updateStatus.mutate({ id: u.id, isActive: !u.isActive })
                        : setConfirming({ userId: u.id, action: "status" })
                    }
                  />
                  <ActionButton label="إعادة تعيين كلمة المرور" onPress={() => setResettingTarget(u)} />
                </View>
              </View>
            );
          })
        )}

        {users.data && users.data.total > users.data.pageSize ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.md }}
            >
              <AppText size="small" color={page <= 1 ? colors.line : colors.accent}>
                السابق
              </AppText>
            </Pressable>
            <AppText size="small" color={colors.muted}>
              صفحة {page} من {totalPages}
            </AppText>
            <Pressable
              accessibilityRole="button"
              disabled={page >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.md }}
            >
              <AppText size="small" color={page >= totalPages ? colors.line : colors.accent}>
                التالي
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <NewUserSheet
        visible={creatingUser}
        onClose={() => setCreatingUser(false)}
        onCreate={(input) => createUser.mutate(input)}
        creating={createUser.isPending}
      />

      <ConfirmSheet
        visible={!!resettingTarget}
        onClose={() => setResettingTarget(null)}
        title="إعادة تعيين كلمة المرور"
        consequence={
          resettingTarget
            ? `سيتم توليد كلمة مرور مؤقتة لـ«${resettingTarget.displayName}» وإنهاء جلساته الحالية.`
            : ""
        }
        confirmLabel="إعادة تعيين"
        confirming={resetPassword.isPending}
        onConfirm={() => {
          if (resettingTarget) resetPassword.mutate(resettingTarget.id);
        }}
      />

      <ResetPasswordResultSheet
        visible={!!resetResult}
        onClose={() => setResetResult(null)}
        email={resetResult?.email ?? null}
        temporaryPassword={resetResult?.temporaryPassword ?? null}
      />
    </Screen>
  );
}

function Badge({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View style={{ borderRadius: radii.chip, backgroundColor: background, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
      <AppText size="caption" weight="semibold" color={color}>
        {label}
      </AppText>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET - 8,
        justifyContent: "center",
        paddingHorizontal: spacing.md,
        borderRadius: radii.field,
        borderWidth: 1,
        borderColor: danger ? colors.alert : colors.line,
        backgroundColor: danger ? colors.alertSoft : colors.surface,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <AppText size="caption" weight="semibold" color={danger ? colors.alert : colors.ink}>
        {label}
      </AppText>
    </Pressable>
  );
}
