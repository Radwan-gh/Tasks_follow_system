import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { formatDueDate } from "@/lib/date";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * `/board/:id/settings` — the design's «إعدادات اللوحة والأعضاء» single
 * screen (`v2-new-style.md` §7.2): rename/description/due-date, add member
 * by email, remove member, archive. All endpoints already exist
 * (`PATCH /boards/:id`, `POST`/`DELETE .../members`) — this is UI only,
 * mirroring `apps/web`'s `BoardSettingsModal`/`BoardMembersModal`.
 */
export default function BoardSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const board = useQuery({ queryKey: ["board", id], queryFn: () => api.boards.get(id) });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [pickingDueDate, setPickingDueDate] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [removingMember, setRemovingMember] = useState<{ userId: string; displayName: string } | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (board.data && !seeded) {
      setName(board.data.name);
      setDescription(board.data.description ?? "");
      setDueDate(board.data.dueDate);
      setSeeded(true);
    }
  }, [board.data, seeded]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["board", id] });
    void queryClient.invalidateQueries({ queryKey: ["boards"] });
  }

  function reportError(err: unknown) {
    setError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقّع");
  }

  const save = useMutation({
    mutationFn: () => api.boards.update(id, { name: name.trim(), description: description.trim() || null, dueDate }),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: reportError,
  });

  const archive = useMutation({
    mutationFn: () => api.boards.update(id, { isArchived: true }),
    onSuccess: () => {
      invalidate();
      router.back();
      router.back();
    },
    onError: reportError,
  });

  const addMember = useMutation({
    mutationFn: (email: string) => api.boards.addMember(id, email),
    onSuccess: () => {
      setMemberEmail("");
      setError(null);
      invalidate();
    },
    onError: reportError,
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.boards.removeMember(id, userId),
    onSuccess: () => {
      setRemovingMember(null);
      invalidate();
    },
    onError: reportError,
  });

  if (board.isPending) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ padding: spacing.xl, gap: spacing.md }}>
        <Skeleton height={24} width="50%" />
        <Skeleton height={48} />
      </Screen>
    );
  }

  if (board.isError || !board.data) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ justifyContent: "center" }}>
        <ErrorState onRetry={() => void board.refetch()} />
      </Screen>
    );
  }

  const canArchive = board.data.ownerId === user?.id;

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
        <AppText weight="bold">إعدادات اللوحة</AppText>
        <Pressable accessibilityRole="button" onPress={() => save.mutate()} disabled={save.isPending} hitSlop={8}>
          <AppText weight="bold" color={colors.accent}>
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md }}>
            <AppText size="small" color={colors.alert}>
              {error}
            </AppText>
          </View>
        ) : null}

        <Field label="اسم اللوحة">
          <TextInput
            value={name}
            onChangeText={setName}
            style={{
              minHeight: MIN_TOUCH_TARGET,
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
        </Field>

        <Field label="الوصف">
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="ما الغرض من هذه اللوحة؟"
            placeholderTextColor={colors.muted}
            style={{
              minHeight: 80,
              backgroundColor: colors.canvas,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radii.card,
              padding: spacing.md,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        </Field>

        <Pressable
          accessibilityRole="button"
          onPress={() => setPickingDueDate(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: MIN_TOUCH_TARGET,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }}
        >
          <AppText size="small" color={colors.muted}>
            موعد التسليم
          </AppText>
          <AppText size="small" weight="semibold">
            {dueDate ? formatDueDate(dueDate) : "بلا موعد"}
          </AppText>
        </Pressable>

        <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            أعضاء اللوحة
          </AppText>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <TextInput
              value={memberEmail}
              onChangeText={setMemberEmail}
              placeholder="إضافة عضو بالبريد الإلكتروني"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              onSubmitEditing={() => memberEmail.trim() && addMember.mutate(memberEmail.trim())}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET,
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
            <Pressable
              accessibilityRole="button"
              disabled={!memberEmail.trim() || addMember.isPending}
              onPress={() => addMember.mutate(memberEmail.trim())}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.field,
                backgroundColor: colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText weight="semibold" color={colors.surface}>
                إضافة
              </AppText>
            </Pressable>
          </View>

          <View style={{ gap: spacing.sm }}>
            {board.data.members.map((member) => {
              const palette = avatarColorFor(member.userId);
              return (
                <View
                  key={member.userId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    padding: spacing.md,
                    backgroundColor: colors.canvas,
                    borderRadius: radii.card,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      backgroundColor: palette.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText size="caption" weight="bold" color={palette.fg}>
                      {initials(member.user.displayName)}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText weight="semibold" size="small">
                      {member.user.displayName}
                    </AppText>
                    <AppText size="caption" color={colors.muted}>
                      {member.user.email}
                    </AppText>
                  </View>
                  <View
                    style={{
                      borderRadius: radii.chip,
                      backgroundColor: member.role === "OWNER" ? colors.ink : colors.line,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 3,
                    }}
                  >
                    <AppText size="caption" weight="semibold" color={member.role === "OWNER" ? colors.surface : colors.muted}>
                      {member.role === "OWNER" ? "مالك" : "عضو"}
                    </AppText>
                  </View>
                  {member.role !== "OWNER" ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setRemovingMember({ userId: member.userId, displayName: member.user.displayName })}
                      hitSlop={8}
                    >
                      <AppText size="caption" weight="semibold" color={colors.alert}>
                        إزالة
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {canArchive ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmingArchive(true)}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                backgroundColor: colors.alertSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText weight="semibold" color={colors.alert}>
                أرشفة اللوحة
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} />

      <ConfirmSheet
        visible={confirmingArchive}
        onClose={() => setConfirmingArchive(false)}
        title="أرشفة اللوحة"
        consequence="تصبح اللوحة للقراءة فقط، وتُستثنى من تقريرَي المتأخّرة وعبء العمل. يمكن استعادتها لاحقًا."
        confirmLabel="أرشفة"
        confirming={archive.isPending}
        onConfirm={() => archive.mutate()}
      />

      <ConfirmSheet
        visible={!!removingMember}
        onClose={() => setRemovingMember(null)}
        title="إزالة عضو"
        consequence={
          removingMember
            ? `ستتم إزالة «${removingMember.displayName}» من اللوحة. لن يعود بإمكانه رؤيتها أو الوصول لبطاقاتها.`
            : ""
        }
        confirmLabel="إزالة"
        confirming={removeMember.isPending}
        onConfirm={() => {
          if (removingMember) removeMember.mutate(removingMember.userId);
        }}
      />
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        {label}
      </AppText>
      {children}
    </View>
  );
}
