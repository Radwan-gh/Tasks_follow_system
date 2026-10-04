import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import type { BoardMember, BoardRole } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { PeopleField } from "@/features/cards/people-field";
import { formatDueDate } from "@/lib/date";
import { api } from "@/lib/api";
import { RevealScrollView } from "@/lib/scroll-reveal";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * `/board/:id/settings` — the design's «إعدادات اللوحة والأعضاء» single
 * screen (`v2-new-style.md` §7.2): rename/description/due-date, archive, and
 * the members — edited with the same inline `PeopleField` as task assignees,
 * saving every add/remove at once (`PUT /boards/:id/members`). Mirrors
 * `apps/web`'s `BoardSettingsModal`/`BoardMembersModal`.
 */
/** Short enough to feel live; the typed text is still re-matched locally on every keystroke. */
const SEARCH_DEBOUNCE_MS = 150;
/** The server's cap — enough rows for the local prefix-first ranking to pick the best 3 from. */
const CANDIDATE_LIMIT = 50;
/** Stable fallback while the board loads, so `useAutoSavedIds` sees one empty list, not a new one per render. */
const NO_MEMBERS: BoardMember[] = [];

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
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (board.data && !seeded) {
      setName(board.data.name);
      setDescription(board.data.description ?? "");
      setDueDate(board.data.dueDate);
      setSeeded(true);
    }
  }, [board.data, seeded]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(memberSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  const members = board.data?.members ?? NO_MEMBERS;
  const isOwner = !!user && board.data?.ownerId === user.id;

  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);
  const memberSelection = useAutoSavedIds(memberIds, async (userIds) => {
    await api.boards.setMembers(id, { userIds });
    invalidate();
  });

  const candidates = useQuery({
    queryKey: ["member-candidates", id, debouncedSearch],
    queryFn: () => api.boards.memberCandidates(id, { search: debouncedSearch, limit: CANDIDATE_LIMIT }),
    enabled: isOwner && debouncedSearch.length > 0,
    placeholderData: (previous) => previous,
  });

  // Candidates in the picker's shape. Everyone ever suggested is remembered
  // so a just-added chip still resolves before the board refetch lists them.
  const pool = useMemo<BoardMember[]>(
    () => (candidates.data?.users ?? []).map((u) => ({ userId: u.id, boardId: id, role: "MEMBER", user: u })),
    [candidates.data, id],
  );
  const seen = useRef(new Map<string, BoardMember>());
  const lookup = useMemo(() => {
    for (const m of pool) seen.current.set(m.userId, m);
    const onBoard = new Set(members.map((m) => m.userId));
    return [...members, ...[...seen.current.values()].filter((m) => !onBoard.has(m.userId))];
  }, [members, pool]);
  const ownerIds = useMemo(
    () => new Set(members.filter((m) => m.role === "OWNER").map((m) => m.userId)),
    [members],
  );
  const roleOf = useMemo(() => new Map(members.map((m) => [m.userId, m.role])), [members]);

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

  const canArchive = isOwner;

  function roleChip(member: BoardMember) {
    const role = roleOf.get(member.userId);
    // Not saved yet — nothing to switch until the server has the row.
    if (!role) return null;
    const label = role === "OWNER" ? "مالك" : role === "VIEWER" ? "مشاهد" : "عضو";
    if (role === "OWNER" || !isOwner) {
      return (
        <AppText size="caption" weight="semibold" color={colors.muted}>
          {label}
        </AppText>
      );
    }
    return (
      // §3c-4 "منتقي دور لكل عضو (عضو ▾ / مشاهد) يتاح للمالك" — inside the chip:
      // tapping the role switches it, tapping the rest of the chip removes the person.
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`دور ${member.user.displayName}: ${label} — اضغط للتبديل`}
        disabled={updateMemberRole.isPending}
        hitSlop={6}
        onPress={() =>
          updateMemberRole.mutate({ userId: member.userId, role: role === "VIEWER" ? "MEMBER" : "VIEWER" })
        }
        style={{ borderRadius: radii.chip, backgroundColor: colors.line, paddingHorizontal: spacing.sm, paddingVertical: 1 }}
      >
        <AppText size="caption" weight="semibold" color={colors.muted}>
          {label} ▾
        </AppText>
      </Pressable>
    );
  }

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

      <RevealScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
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
          <PeopleField
            label="أعضاء اللوحة"
            members={pool}
            lookup={lookup}
            selectedIds={memberSelection.ids}
            onChange={memberSelection.change}
            saving={memberSelection.saving}
            failed={memberSelection.failed}
            readOnly={!isOwner}
            onTermChange={setMemberSearch}
            searching={candidates.isFetching || memberSearch.trim() !== debouncedSearch}
            noMatchText={(typed) =>
              // Only an admin can create the missing account, so only an admin is told how.
              user?.role === "ADMIN"
                ? `لا يوجد مستخدم يطابق «${typed}» ويمكن إضافته. إن لم يكن له حساب بعد، أنشئه من «حسابي ← المستخدمون والصلاحيات».`
                : `لا يوجد مستخدم يطابق «${typed}» ويمكن إضافته.`
            }
            lockedIds={ownerIds}
            chipExtra={roleChip}
            placeholder="اكتب اسمًا أو اسم مستخدم لإضافته"
            accessibilityLabel="أضف عضوًا إلى اللوحة"
          />
          {isOwner ? (
            <AppText size="caption" color={colors.muted}>
              الأعضاء يعدّلون المهام، والمشاهدون يقرؤون فقط. اضغط الدور لتبديله، واضغط الاسم لإزالته.
            </AppText>
          ) : null}
        </View>

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
      </RevealScrollView>

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
