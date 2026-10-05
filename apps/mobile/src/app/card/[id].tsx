import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, TextInput, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/state-views";
import { ConfirmSheet } from "@/components/confirm-sheet";
import type { Card, CardPriority, RecurrenceRule } from "@app/types";
import { PeopleField } from "@/features/cards/people-field";
import { AttachmentsSection } from "@/features/cards/attachments-section";
import { MoveCardSheet } from "@/features/boards/move-card-sheet";
import { CostSheet, formatCostChip } from "@/components/cost-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { PrioritySheet, priorityLabel } from "@/components/priority-control";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { SubtasksSection } from "@/features/cards/subtasks-section";
import { HistorySection } from "@/features/cards/history-section";
import { useAuth } from "@/features/auth/auth-context";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { useCurrencySymbol } from "@/lib/currency";
import { formatDueDate, isOverdue } from "@/lib/date";
import { formatHijri } from "@/lib/hijri";
import { api } from "@/lib/api";
import { RevealScrollView } from "@/lib/scroll-reveal";
import { LIVE_REFETCH_MS, boardDetailKey, findCachedBoard, findCachedCard, recentClosedSince } from "@/lib/board-cache";
import { colors, fonts, fontSizes, radii, spacing, statusColors } from "@/theme/tokens";

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

/** Stable fallback while the card loads, so `useAutoSavedIds` sees one empty list, not a new one per render. */
const NO_IDS: string[] = [];

/**
 * `/card/:id` — presented as a native modal over the board screen, matching
 * the design's full-height bottom sheet ("تفاصيل البطاقة"). Two save models,
 * same split as `apps/web`'s `CardDetailModal.tsx`, and the header makes the
 * split visible: the *typed* fields — title, description, due date,
 * recurrence — wait for «حفظ», which lights up only while one of them differs
 * from the saved task; everything picked from a sheet or list — status,
 * priority, cost, assignees, access, subtasks, attachments — saves the moment
 * it is picked. Leaving with unsaved typed edits (إلغاء, system back) asks
 * first instead of dropping them.
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
  const [restricted, setRestricted] = useState(false);
  const [pickingCost, setPickingCost] = useState(false);
  const [pickingPriority, setPickingPriority] = useState(false);
  const [pickingStatus, setPickingStatus] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);

  // Unsaved = a «حفظ» field differs from what the server last sent. The access
  // toggle has its own save path, so it never counts.
  const dirty =
    !!seeded && !sameFormFields({ title, description, dueDate, recurrence, restricted: seeded.restricted }, seeded);

  // Every way out — «إلغاء», the system back button or gesture — is a removal
  // of this screen, so one `beforeRemove` listener guards them all. Refs, not
  // state, so a save can mark itself as leaving and go back in the same tick.
  const navigation = useNavigation();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const leavingRef = useRef(false);
  const [pendingLeave, setPendingLeave] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!dirtyRef.current || leavingRef.current) return;
        event.preventDefault();
        setPendingLeave(event.data.action);
      }),
    [navigation],
  );

  function leave() {
    leavingRef.current = true;
    router.back();
  }

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
      leave();
    },
  });

  // The people fields save on every add/remove — there is no save button.
  const assigneeSelection = useAutoSavedIds(card.data?.assigneeIds ?? NO_IDS, async (userIds) => {
    await api.cards.updateAssignees(id, { userIds });
    invalidateCard();
  });

  const accessSelection = useAutoSavedIds(card.data?.memberIds ?? NO_IDS, async (memberUserIds) => {
    await api.cards.updateAccess(id, { isRestricted: true, memberUserIds });
    invalidateCard();
  });

  const unrestrict = useMutation({
    mutationFn: () => api.cards.updateAccess(id, { isRestricted: false, memberUserIds: [] }),
    onSuccess: invalidateCard,
    onError: () => setRestricted(true),
  });

  const updatePriority = useMutation({
    mutationFn: (priority: CardPriority) => api.cards.update(id, { priority }),
    onSuccess: () => {
      setPickingPriority(false);
      invalidateCard();
    },
  });

  // The status chip's move — the visible way to reach every status, which the
  // board otherwise only offers on long-press. The chip itself is the
  // confirmation: it changes to the new status as soon as it is picked.
  const moveCard = useMutation({
    mutationFn: (targetListId: string) => api.cards.update(id, { targetListId }),
    onMutate: async (targetListId) => {
      setPickingStatus(false);
      await queryClient.cancelQueries({ queryKey: ["card", id] });
      const previous = queryClient.getQueryData<Card>(["card", id]);
      if (previous) queryClient.setQueryData<Card>(["card", id], { ...previous, listId: targetListId });
      return { previous };
    },
    onError: (_err, _targetListId, context) => {
      if (context?.previous) queryClient.setQueryData(["card", id], context.previous);
    },
    onSettled: invalidateCard,
  });

  const updateCost = useMutation({
    mutationFn: (input: { costAmount: string | null; costNote: string | null }) => api.cards.update(id, input),
    onSuccess: () => {
      setPickingCost(false);
      invalidateCard();
    },
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
  const nonImplicitMembers = board.data.members.filter(
    (m) => m.userId !== board.data!.ownerId && m.userId !== card.data.createdById,
  );
  const overdue = dueDate ? isOverdue(dueDate) : false;
  // §3c-4 "اللوحة بعين المشاهد ... تفاصيل البطاقة قراءة كاملة بلا حقل تعليق".
  const myRole = board.data.members.find((m) => m.userId === user?.id)?.role;
  // Opened from «المتابعة» without being a member: read-only like a viewer.
  const isSupervised = board.data.supervised;
  const isViewer = myRole === "VIEWER" || isSupervised;
  const canManageAccess = !isViewer && (user?.id === board.data.ownerId || user?.id === card.data.createdById);
  // §3c-4 "منتقي المسؤولين لا يعرض المشاهدين".
  const assignableMembers = board.data.members.filter((m) => m.role !== "VIEWER");
  // An archived board refuses every write (`assertBoardMutable`), so its chips don't offer them.
  const readOnly = isViewer || board.data.isArchived;
  const canSave = dirty && title.trim().length > 0 && !save.isPending;
  const listIndex = board.data.lists.findIndex((l) => l.id === card.data.listId);
  const nextListId = board.data.lists[listIndex + 1]?.id ?? null;
  // §3b-4: only the board owner or this task's assignees may move it into «انتهى».
  const canCloseCard = !!user && (board.data.ownerId === user.id || card.data.assigneeIds.includes(user.id));

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

        {/* Both chips open a picker, and both say so with the same ▾. */}
        {list ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`الحالة: ${list.name}. اضغط للنقل إلى حالة أخرى`}
            onPress={() => setPickingStatus(true)}
            disabled={readOnly || moveCard.isPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              backgroundColor: colors.canvas,
              borderRadius: 999,
              paddingHorizontal: spacing.md,
              minHeight: 30,
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
              {readOnly ? "" : " ▾"}
            </AppText>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`الأولوية: ${priorityLabel(card.data.priority)}. اضغط للتغيير`}
          onPress={() => {
            updatePriority.reset();
            setPickingPriority(true);
          }}
          disabled={readOnly}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.xs,
            backgroundColor: card.data.priority === "URGENT" ? colors.urgentSoft : colors.canvas,
            borderRadius: 999,
            paddingHorizontal: spacing.md,
            minHeight: 30,
          }}
        >
          <AppText size="caption" weight="semibold" color={card.data.priority === "URGENT" ? colors.urgent : colors.muted}>
            {priorityLabel(card.data.priority)}
            {readOnly ? "" : " ▾"}
          </AppText>
        </Pressable>

        {!isViewer ? (
          // Lit only while there is something to save — so it doubles as the
          // "you have unsaved edits" signal the instant-save fields never raise.
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSave }}
            onPress={() => save.mutate()}
            disabled={!canSave}
            hitSlop={8}
          >
            <AppText weight="bold" color={canSave || save.isPending ? colors.accent : colors.muted}>
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
            {isSupervised ? "وضع المتابعة — للقراءة فقط" : "للعرض فقط — أنت مشاهد في هذه اللوحة"}
          </AppText>
        </View>
      ) : null}

      <RevealScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void pullToRefresh()} />}
      >
        <View style={{ gap: spacing.md }}>
          {/* A hairline (accent while typing) is what tells this heading
              apart as a field — same device as the new-task title. */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => setTitleFocused(false)}
            multiline
            editable={!isViewer}
            accessibilityLabel="عنوان المهمة"
            style={{
              fontFamily: fonts.bold,
              fontSize: fontSizes.heading,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
              lineHeight: fontSizes.heading * 1.5,
              paddingBottom: isViewer ? 0 : spacing.xs,
              borderBottomWidth: isViewer ? 0 : 1,
              borderBottomColor: titleFocused ? colors.accent : colors.line,
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

        <PeopleField
          label="المسؤولون عن المهمة"
          members={assignableMembers}
          lookup={board.data.members}
          selectedIds={assigneeSelection.ids}
          onChange={assigneeSelection.change}
          saving={assigneeSelection.saving}
          failed={assigneeSelection.failed}
          readOnly={isViewer}
          placeholder="اكتب اسمًا لإسناد المهمة"
          accessibilityLabel="أضف مسؤولًا عن المهمة"
          emptyHint="لا يوجد أعضاء في اللوحة لإسنادها إليهم."
          noneLabel="لا يوجد مسؤولون."
        />

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
                if (!next && card.data.isRestricted) unrestrict.mutate();
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
              <>
                <PeopleField
                  members={nonImplicitMembers}
                  lookup={board.data.members}
                  selectedIds={accessSelection.ids}
                  onChange={accessSelection.change}
                  saving={accessSelection.saving}
                  failed={accessSelection.failed}
                  placeholder="اكتب اسم من يملك الوصول"
                  accessibilityLabel="أضف شخصًا يملك الوصول"
                  emptyHint="لا يوجد أعضاء آخرون في اللوحة."
                />
                <AppText size="caption" color={colors.muted}>
                  مالك اللوحة ومُنشئ المهمة يملكان الوصول دائمًا.
                </AppText>
              </>
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
      </RevealScrollView>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} value={dueDate} />

      <CostSheet
        visible={pickingCost}
        onClose={() => setPickingCost(false)}
        amount={card.data.costAmount}
        note={card.data.costNote}
        saving={updateCost.isPending}
        onSave={(costAmount, costNote) => updateCost.mutate({ costAmount, costNote })}
      />

      <RecurrenceSheet
        visible={pickingRecurrence}
        onClose={() => setPickingRecurrence(false)}
        value={recurrence}
        onChange={setRecurrence}
      />

      <PrioritySheet
        visible={pickingPriority}
        onClose={() => setPickingPriority(false)}
        value={card.data.priority}
        onChange={(priority) => updatePriority.mutate(priority)}
        saving={updatePriority.isPending}
        failed={updatePriority.isError}
      />

      <MoveCardSheet
        visible={pickingStatus}
        onClose={() => setPickingStatus(false)}
        card={card.data}
        lists={board.data.lists}
        nextListId={nextListId}
        canCloseCard={canCloseCard}
        onMove={(targetListId) => moveCard.mutate(targetListId)}
      />

      <ConfirmSheet
        visible={!!pendingLeave}
        onClose={() => setPendingLeave(null)}
        title="تجاهل التعديلات؟"
        consequence="لم تُحفظ تعديلاتك على العنوان أو الوصف أو الموعد. إن خرجت الآن فستضيع."
        confirmLabel="تجاهل والخروج"
        cancelLabel="متابعة التعديل"
        onConfirm={() => {
          const action = pendingLeave;
          setPendingLeave(null);
          leavingRef.current = true;
          if (action) navigation.dispatch(action);
        }}
      />
    </Screen>
  );
}
