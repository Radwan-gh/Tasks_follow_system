import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/state-views";
import type { CardPriority, RecurrenceRule } from "@app/types";
import { AssigneePickerSheet } from "@/features/cards/assignee-picker-sheet";
import { AttachmentsSection } from "@/features/cards/attachments-section";
import { DueDateSheet } from "@/components/due-date-sheet";
import { nextPriority, priorityLabel } from "@/components/priority-control";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { SubtasksSection } from "@/features/cards/subtasks-section";
import { HistorySection } from "@/features/cards/history-section";
import { useAuth } from "@/features/auth/auth-context";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { formatDueDate, isOverdue } from "@/lib/date";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * `/card/:id` — presented as a native modal over the board screen, matching
 * the design's full-height bottom sheet ("تفاصيل البطاقة"). Three
 * independent saves, same split as `apps/web`'s `CardDetailModal.tsx`: the
 * header's «حفظ» commits title/description/due-date; assignees and
 * restricted-access each commit immediately from their own picker sheet.
 */
export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const card = useQuery({ queryKey: ["card", id], queryFn: () => api.cards.get(id) });
  const board = useQuery({
    queryKey: ["board", card.data?.boardId],
    queryFn: () => api.boards.get(card.data!.boardId),
    enabled: !!card.data,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [pickingDueDate, setPickingDueDate] = useState(false);
  const [pickingRecurrence, setPickingRecurrence] = useState(false);
  const [pickingAssignees, setPickingAssignees] = useState(false);
  const [pickingRestrictedMembers, setPickingRestrictedMembers] = useState(false);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    if (card.data && !seeded) {
      setTitle(card.data.title);
      setDescription(card.data.description ?? "");
      setDueDate(card.data.dueDate);
      setRecurrence(card.data.recurrence);
      setRestricted(card.data.isRestricted);
      setSeeded(true);
    }
  }, [card.data, seeded]);

  function invalidateCard() {
    void queryClient.invalidateQueries({ queryKey: ["card", id] });
    if (card.data) void queryClient.invalidateQueries({ queryKey: ["board", card.data.boardId] });
  }

  const save = useMutation({
    mutationFn: () => api.cards.update(id, { title, description: description || null, dueDate, recurrence }),
    onSuccess: () => {
      invalidateCard();
      router.back();
    },
  });

  const updateAssignees = useMutation({
    mutationFn: (userIds: string[]) => api.cards.updateAssignees(id, { userIds }),
    onSuccess: () => {
      setPickingAssignees(false);
      invalidateCard();
    },
  });

  const updateAccess = useMutation({
    mutationFn: (memberUserIds: string[]) => api.cards.updateAccess(id, { isRestricted: restricted, memberUserIds }),
    onSuccess: () => {
      setPickingRestrictedMembers(false);
      invalidateCard();
    },
  });

  const updatePriority = useMutation({
    mutationFn: (priority: CardPriority) => api.cards.update(id, { priority }),
    onSuccess: invalidateCard,
  });

  if (card.isPending || (card.isSuccess && board.isPending)) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.md }}>
        <Skeleton height={24} width="60%" />
        <Skeleton height={90} />
        <Skeleton height={60} />
      </Screen>
    );
  }

  if (card.isError || board.isError || !board.data) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: colors.surface, justifyContent: "center" }}>
        <ErrorState onRetry={() => void card.refetch()} />
      </Screen>
    );
  }

  const list = board.data.lists.find((l) => l.id === card.data.listId);
  const creator = board.data.members.find((m) => m.userId === card.data.createdById);
  const assignees = card.data.assigneeIds
    .map((uid) => board.data!.members.find((m) => m.userId === uid))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const nonImplicitMembers = board.data.members.filter(
    (m) => m.userId !== board.data!.ownerId && m.userId !== card.data.createdById,
  );
  const canManageAccess = user?.id === board.data.ownerId || user?.id === card.data.createdById;
  const overdue = dueDate ? isOverdue(dueDate) : false;

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

        {list ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              backgroundColor: colors.canvas,
              borderRadius: 999,
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: statusColors[list.statusCategory ?? "UNCATEGORIZED"],
              }}
            />
            <AppText size="caption" weight="semibold">
              {list.name}
            </AppText>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="الأولوية — اضغط للتبديل"
          onPress={() => updatePriority.mutate(nextPriority(card.data.priority))}
          disabled={updatePriority.isPending}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            backgroundColor: card.data.priority === "URGENT" ? colors.urgentSoft : colors.canvas,
            borderRadius: 999,
            paddingHorizontal: spacing.md,
            paddingVertical: 5,
          }}
        >
          <AppText size="caption" weight="semibold" color={card.data.priority === "URGENT" ? colors.urgent : colors.muted}>
            {priorityLabel(card.data.priority)}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => save.mutate()}
          disabled={save.isPending || title.trim().length === 0}
          hitSlop={8}
        >
          <AppText weight="bold" color={title.trim().length === 0 ? colors.muted : colors.accent}>
            {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.md }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            multiline
            style={{
              fontFamily: fonts.bold,
              fontSize: fontSizes.heading,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
              lineHeight: fontSizes.heading * 1.5,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickingDueDate(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: dueDate ? (overdue ? colors.alertSoft : colors.canvas) : colors.canvas,
                borderRadius: 999,
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
              }}
            >
              <AppText size="small" weight="semibold" color={dueDate && overdue ? colors.alert : colors.muted}>
                {dueDate ? `◷ ${formatDueDate(dueDate)}` : "◷ إضافة موعد تسليم"}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickingRecurrence(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: colors.canvas,
                borderRadius: 999,
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
              }}
            >
              <AppText size="small" weight="semibold" color={colors.muted}>
                {recurrence ? `↻ ${summarizeRecurrence(recurrence)}` : "↻ إضافة تكرار"}
              </AppText>
            </Pressable>
            {creator ? (
              <AppText size="caption" color={colors.muted}>
                أنشأها {creator.user.displayName} · {board.data.name}
              </AppText>
            ) : null}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            الوصف
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="أضف وصفًا للمهمة"
            placeholderTextColor={colors.muted}
            style={{
              minHeight: 90,
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
              lineHeight: fontSizes.body * 1.7,
            }}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            المسؤولون عن المهمة
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {assignees.map((member) => {
              const palette = avatarColorFor(member.userId);
              return (
                <View
                  key={member.userId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    backgroundColor: colors.canvas,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: spacing.md,
                    opacity: member.user.isActive ? 1 : 0.5,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      backgroundColor: palette.bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText size="caption" weight="bold" color={palette.fg} style={{ fontSize: 10 }}>
                      {initials(member.user.displayName)}
                    </AppText>
                  </View>
                  <AppText size="small">{member.user.displayName}</AppText>
                  {!member.user.isActive ? (
                    <View style={{ borderRadius: radii.chip, backgroundColor: colors.line, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                      <AppText size="caption" weight="semibold" color={colors.muted}>
                        معطَّل
                      </AppText>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إضافة مسؤول"
              onPress={() => setPickingAssignees(true)}
              style={{
                width: MIN_TOUCH_TARGET - 6,
                height: MIN_TOUCH_TARGET - 6,
                borderRadius: 999,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText color={colors.muted}>+</AppText>
            </Pressable>
          </View>
        </View>

        <SubtasksSection cardId={id} boardMembers={board.data.members} />

        <AttachmentsSection cardId={id} />

        {canManageAccess ? (
          <View style={{ gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: restricted }}
              onPress={() => {
                const next = !restricted;
                setRestricted(next);
                // Toggling off clears the access list immediately (matches
                // `UpdateCardAccessRequest`'s full-replace semantics); toggling
                // on doesn't save until members are actually picked.
                if (!next) updateAccess.mutate([]);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  backgroundColor: restricted ? colors.accent : "transparent",
                  borderWidth: restricted ? 0 : 1.5,
                  borderColor: colors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {restricted ? (
                  <AppText size="caption" color={colors.surface}>
                    ✓
                  </AppText>
                ) : null}
              </View>
              <AppText weight="semibold" size="small">
                تقييد الوصول لأشخاص محددين
              </AppText>
            </Pressable>
            {restricted ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickingRestrictedMembers(true)}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  justifyContent: "center",
                  paddingHorizontal: spacing.lg,
                  borderRadius: radii.field,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <AppText size="small" color={colors.accent}>
                  اختيار الأعضاء ({card.data.memberIds.length})
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : card.data.isRestricted ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
            <AppText size="small" color={colors.muted}>
              🔒 هذه المهمة خاصة بأشخاص محددين.
            </AppText>
          </View>
        ) : null}

        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
          <HistorySection cardId={id} />
        </View>
      </ScrollView>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} />

      <RecurrenceSheet
        visible={pickingRecurrence}
        onClose={() => setPickingRecurrence(false)}
        value={recurrence}
        onChange={setRecurrence}
      />

      <AssigneePickerSheet
        visible={pickingAssignees}
        onClose={() => setPickingAssignees(false)}
        title="المسؤولون"
        subtitle={`${title} — يمكن اختيار أكثر من شخص، ويجب أن يكون عضوًا في اللوحة.`}
        members={board.data.members}
        selectedIds={card.data.assigneeIds}
        onSave={(userIds) => updateAssignees.mutate(userIds)}
        saveLabel="حفظ المسؤولين"
      />

      <AssigneePickerSheet
        visible={pickingRestrictedMembers}
        onClose={() => setPickingRestrictedMembers(false)}
        title="من يملك الوصول"
        subtitle="مالك اللوحة ومُنشئ المهمة يملكان الوصول دائمًا."
        members={nonImplicitMembers}
        selectedIds={card.data.memberIds}
        onSave={(userIds) => updateAccess.mutate(userIds)}
        saveLabel="تحديث الوصول"
      />
    </Screen>
  );
}
