import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import type { BoardMemberCandidate, BoardRole } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { AddMemberSheet } from "@/features/boards/add-member-sheet";
import { TemplatesSection } from "@/features/boards/templates-section";
import { useAuth } from "@/features/auth/auth-context";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { formatDueDate } from "@/lib/date";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * `/board/:id/settings` — the design's «إعدادات اللوحة والأعضاء» single
 * screen (`v2-new-style.md` §7.2): rename/description/due-date, add member
 * by picking them from the directory, remove member, archive. All endpoints already exist
 * (`PATCH /boards/:id`, `POST`/`DELETE .../members`) — this is UI only,
 * mirroring `apps/web`'s `BoardSettingsModal`/`BoardMembersModal`.
 */
/** Above this many members, the list gets its own filter box. */
const MEMBER_FILTER_THRESHOLD = 6;

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
  const [addingMember, setAddingMember] = useState(false);
  const [memberFilter, setMemberFilter] = useState("");
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
    // Keep the "add member" search from offering someone who is already in.
    void queryClient.invalidateQueries({ queryKey: ["member-candidates", id] });
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

  const restore = useMutation({
    mutationFn: () => api.boards.update(id, { isArchived: false }),
    onSuccess: invalidate,
    onError: reportError,
  });

  const addMember = useMutation({
    mutationFn: (input: { userId: string; role: Exclude<BoardRole, "OWNER"> }) =>
      api.boards.addMember(id, input.userId, input.role),
    onSuccess: () => {
      setAddingMember(false);
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setAddingMember(false);
      reportError(err);
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.boards.removeMember(id, userId),
    onSuccess: () => {
      setRemovingMember(null);
      invalidate();
    },
    onError: reportError,
  });

  // §3c-4 "منتقي دور لكل عضو (عضو ▾ / مشاهد) يتاح للمالك".
  const updateMemberRole = useMutation({
    mutationFn: (input: { userId: string; role: Exclude<BoardRole, "OWNER"> }) =>
      api.boards.updateMemberRole(id, input.userId, input.role),
    onSuccess: invalidate,
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
  const filterTerm = memberFilter.trim().toLowerCase();
  const visibleMembers = filterTerm
    ? board.data.members.filter(
        (m) =>
          m.user.displayName.toLowerCase().includes(filterTerm) ||
          m.user.username.toLowerCase().includes(filterTerm),
      )
    : board.data.members;

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

          {/* Owners add people by searching the directory — no exact username to recall. */}
          {canArchive ? (
            <Pressable
              accessibilityRole="button"
              disabled={addMember.isPending}
              onPress={() => setAddingMember(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
                minHeight: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                backgroundColor: colors.accent,
              }}
            >
              <AppText weight="semibold" color={colors.surface}>
                {addMember.isPending ? "جارٍ الإضافة..." : "＋ إضافة عضو"}
              </AppText>
            </Pressable>
          ) : null}

          {/* A long board's member list needs filtering as much as the picker does. */}
          {board.data.members.length >= MEMBER_FILTER_THRESHOLD ? (
            <TextInput
              value={memberFilter}
              onChangeText={setMemberFilter}
              placeholder="تصفية الأعضاء بالاسم أو اسم المستخدم"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              accessibilityLabel="تصفية الأعضاء"
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
          ) : null}

          <View style={{ gap: spacing.sm }}>
            {visibleMembers.length === 0 ? (
              <AppText size="small" color={colors.muted}>
                لا يوجد عضو يطابق «{memberFilter.trim()}».
              </AppText>
            ) : null}
            {visibleMembers.map((member) => {
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
                    opacity: member.user.isActive ? 1 : 0.6,
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
                      {member.user.username}
                    </AppText>
                  </View>
                  {!member.user.isActive ? (
                    <View style={{ borderRadius: radii.chip, backgroundColor: colors.alertSoft, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                      <AppText size="caption" weight="semibold" color={colors.alert}>
                        معطَّل
                      </AppText>
                    </View>
                  ) : null}
                  {member.role !== "OWNER" && canArchive ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="تبديل الدور: عضو / مشاهد"
                      disabled={updateMemberRole.isPending}
                      onPress={() =>
                        updateMemberRole.mutate({
                          userId: member.userId,
                          role: member.role === "VIEWER" ? "MEMBER" : "VIEWER",
                        })
                      }
                      style={{
                        borderRadius: radii.chip,
                        backgroundColor: colors.line,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 3,
                      }}
                    >
                      <AppText size="caption" weight="semibold" color={colors.muted}>
                        {member.role === "VIEWER" ? "مشاهد ▾" : "عضو ▾"}
                      </AppText>
                    </Pressable>
                  ) : (
                    <View
                      style={{
                        borderRadius: radii.chip,
                        backgroundColor: member.role === "OWNER" ? colors.ink : colors.line,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 3,
                      }}
                    >
                      <AppText size="caption" weight="semibold" color={member.role === "OWNER" ? colors.surface : colors.muted}>
                        {member.role === "OWNER" ? "مالك" : member.role === "VIEWER" ? "مشاهد" : "عضو"}
                      </AppText>
                    </View>
                  )}
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
            <TemplatesSection boardId={id} />
          </View>
        ) : null}

        {canArchive ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
            {board.data.isArchived ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => restore.mutate()}
                disabled={restore.isPending}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  borderRadius: radii.field,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AppText weight="semibold" color={colors.accent}>
                  {restore.isPending ? "جارٍ الاستعادة..." : "استعادة اللوحة"}
                </AppText>
              </Pressable>
            ) : (
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
            )}
          </View>
        ) : null}
      </ScrollView>

      <AddMemberSheet
        visible={addingMember}
        onClose={() => setAddingMember(false)}
        boardId={id}
        adding={addMember.isPending}
        onPick={(user: BoardMemberCandidate, role) => addMember.mutate({ userId: user.id, role })}
      />

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
