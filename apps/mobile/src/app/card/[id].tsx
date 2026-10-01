import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/state-views";
import type { CardPriority, RecurrenceRule } from "@app/types";
import { AssigneePickerSheet } from "@/features/cards/assignee-picker-sheet";
import { AttachmentsSection } from "@/features/cards/attachments-section";
import { BottomSheet } from "@/components/bottom-sheet";
import { CostSheet, formatCostChip } from "@/components/cost-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { nextPriority, priorityLabel } from "@/components/priority-control";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { SaveAsTemplateSheet } from "@/features/boards/save-as-template-sheet";
import { SubtasksSection } from "@/features/cards/subtasks-section";
import { HistorySection } from "@/features/cards/history-section";
import { useAuth } from "@/features/auth/auth-context";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { useCurrencySymbol } from "@/lib/currency";
import { formatDueDate, isOverdue } from "@/lib/date";
import { formatHijri } from "@/lib/hijri";
import { api } from "@/lib/api";
import { LIVE_REFETCH_MS, boardDetailKey, findCachedBoard, findCachedCard, recentClosedSince } from "@/lib/board-cache";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing, statusColors } from "@/theme/tokens";

/** The fields «حفظ» / the access toggle edit locally before committing. */
interface FormFields {
  title: string;
  description: string;
  dueDate: string | null;
  recurrence: RecurrenceRule | null;
  restricted: boolean;
}

function sameFormFields(a: FormFields, b: FormFields): boolean {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.dueDate === b.dueDate &&
    a.restricted === b.restricted &&
    JSON.stringify(a.recurrence) === JSON.stringify(b.recurrence)
  );
}

/**
 * `/card/:id` — presented as a native modal over the board screen, matching
 * the design's full-height bottom sheet ("تفاصيل البطاقة"). Three
 * independent saves, same split as `apps/web`'s `CardDetailModal.tsx`: the
 * header's «حفظ» commits title/description/due-date; assignees and
 * restricted-access each commit immediately from their own picker sheet.
 */
export default function CardDetailScreen() {
  const params = useLocalSearchParams<{ id: string; boardId?: string }>();
  const id = params.id;
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Usually already seeded by `useOpenCard` from the board on screen; the
  // cached data paints the first frame and, being stamped with the board's
  // fetch time, is still refetched in the background (`lib/board-cache.ts`).
  // Polled so other users' edits show up while the card stays open.
  const card = useQuery({
    queryKey: ["card", id],
    queryFn: () => api.cards.get(id),
    initialData: () => findCachedCard(queryClient, id, params.boardId)?.card,
    initialDataUpdatedAt: () => findCachedCard(queryClient, id, params.boardId)?.updatedAt,
    refetchInterval: LIVE_REFETCH_MS,
  });
  // `boardId` comes in the URL from every entry point, so this no longer waits
  // for the card request — both start together when nothing is cached.
  const boardId = params.boardId || card.data?.boardId;
  const board = useQuery({
    queryKey: boardDetailKey(boardId ?? "", "recent"),
    queryFn: () => api.boards.get(boardId!, recentClosedSince()),
    enabled: !!boardId,
    initialData: () => (boardId ? findCachedBoard(queryClient, boardId)?.data : undefined),
    initialDataUpdatedAt: () => (boardId ? findCachedBoard(queryClient, boardId)?.updatedAt : undefined),
    refetchInterval: LIVE_REFETCH_MS,
  });

  const [pullRefreshing, setPullRefreshing] = useState(false);
  async function pullToRefresh() {
    setPullRefreshing(true);
    try {
      await Promise.all(
        [["card", id], ["board", boardId ?? ""], ["subtasks", id], ["cardAttachments", id], ["cardHistory", id], ["cardComments", id]].map(
          (queryKey) => queryClient.refetchQueries({ queryKey, type: "active" }),
        ),
      );
    } finally {
      setPullRefreshing(false);
    }
  }

  const currencySymbol = useCurrencySymbol();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  /** The server values the form fields were last seeded from. */
  const [seeded, setSeeded] = useState<FormFields | null>(null);
  const [pickingDueDate, setPickingDueDate] = useState(false);
  const [pickingRecurrence, setPickingRecurrence] = useState(false);
  const [pickingAssignees, setPickingAssignees] = useState(false);
  const [pickingRestrictedMembers, setPickingRestrictedMembers] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [pickingCost, setPickingCost] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);

  // The first render may come from cache and background refetches/polls bring
  // other users' edits, so the form re-seeds whenever the server's values
  // change — per field, and only for fields the user hasn't edited, so a
  // refresh never overwrites what they're typing.
  useEffect(() => {
    if (!card.data) return;
    const server: FormFields = {
      title: card.data.title,
      description: card.data.description ?? "",
      dueDate: card.data.dueDate,
      recurrence: card.data.recurrence,
      restricted: card.data.isRestricted,
    };
    if (seeded && sameFormFields(seeded, server)) return;
    if (!seeded || title === seeded.title) setTitle(server.title);
    if (!seeded || description === seeded.description) setDescription(server.description);
    if (!seeded || dueDate === seeded.dueDate) setDueDate(server.dueDate);
    if (!seeded || JSON.stringify(recurrence) === JSON.stringify(seeded.recurrence)) setRecurrence(server.recurrence);
    if (!seeded || restricted === seeded.restricted) setRestricted(server.restricted);
    setSeeded(server);
  }, [card.data, seeded, title, description, dueDate, recurrence, restricted]);

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

  const updateCost = useMutation({
    mutationFn: (input: { costAmount: string | null; costNote: string | null }) => api.cards.update(id, input),
    onSuccess: () => {
      setPickingCost(false);
      invalidateCard();
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: (name: string) => api.cards.saveAsTemplate(id, { name }),
    onSuccess: () => setSavingAsTemplate(false),
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
  const overdue = dueDate ? isOverdue(dueDate) : false;
  const isOwner = user?.id === board.data.ownerId;
  // §3c-4 "اللوحة بعين المشاهد ... تفاصيل البطاقة قراءة كاملة بلا حقل تعليق".
  const myRole = board.data.members.find((m) => m.userId === user?.id)?.role;
  const isViewer = myRole === "VIEWER";
  const canManageAccess = !isViewer && (user?.id === board.data.ownerId || user?.id === card.data.createdById);
  // §3c-4 "منتقي المسؤولين لا يعرض المشاهدين".
  const assignableMembers = board.data.members.filter((m) => m.role !== "VIEWER");

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
          disabled={updatePriority.isPending || isViewer}
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

        {isOwner ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="خيارات إضافية"
            onPress={() => setMenuVisible(true)}
            hitSlop={8}
            style={{ minWidth: MIN_TOUCH_TARGET - 20, alignItems: "center" }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </Pressable>
        ) : null}

        {!isViewer ? (
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
        ) : null}
      </View>

      {isViewer ? (
        <View
          style={{
            marginHorizontal: spacing.xl,
            marginTop: spacing.sm,
            backgroundColor: colors.canvas,
            borderRadius: radii.field,
            padding: spacing.sm,
            alignItems: "center",
          }}
        >
          <AppText size="small" color={colors.muted}>
            للعرض فقط — أنت مشاهد في هذه اللوحة
          </AppText>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void pullToRefresh()} />}
      >
        <View style={{ gap: spacing.md }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            multiline
            editable={!isViewer}
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
              disabled={isViewer}
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
              disabled={isViewer}
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
          {/* §3c-2 "التاريخ الهجري" — secondary muted line under the due-date chip. */}
          {dueDate ? (
            <AppText size="caption" color={colors.muted}>
              الموافق {formatHijri(new Date(dueDate))}
            </AppText>
          ) : null}
        </View>

        {/* §3c-1 "التكلفة" — collapsed row that opens the amount/note sheet; after saving, a details-only chip. */}
        <Pressable
          accessibilityRole="button"
          disabled={isViewer}
          onPress={() => setPickingCost(true)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
        >
          <AppText size="caption" weight="semibold" color={colors.muted}>
            التكلفة
          </AppText>
          <AppText size="small" weight="semibold" color={card.data.costAmount ? colors.ink : colors.accent}>
            {card.data.costAmount ? formatCostChip(card.data.costAmount, card.data.costNote, currencySymbol) : isViewer ? "—" : "إضافة ▾"}
          </AppText>
        </Pressable>

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            الوصف
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            editable={!isViewer}
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
            {!isViewer ? (
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
            ) : null}
          </View>
        </View>

        <SubtasksSection cardId={id} boardMembers={assignableMembers} readOnly={isViewer} />

        <AttachmentsSection cardId={id} readOnly={isViewer} />

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
          <HistorySection cardId={id} readOnly={isViewer} />
        </View>
      </ScrollView>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} />

      <CostSheet
        visible={pickingCost}
        onClose={() => setPickingCost(false)}
        amount={card.data.costAmount}
        note={card.data.costNote}
        saving={updateCost.isPending}
        onSave={(costAmount, costNote) => updateCost.mutate({ costAmount, costNote })}
      />

      <BottomSheet visible={menuVisible} onClose={() => setMenuVisible(false)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenuVisible(false);
              setSavingAsTemplate(true);
            }}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
          >
            <AppText weight="semibold">حفظ كقالب</AppText>
          </Pressable>
        </View>
      </BottomSheet>

      <SaveAsTemplateSheet
        visible={savingAsTemplate}
        onClose={() => setSavingAsTemplate(false)}
        saving={saveAsTemplate.isPending}
        onSave={(name) => saveAsTemplate.mutate(name)}
      />

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
        members={assignableMembers}
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
