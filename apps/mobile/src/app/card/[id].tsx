import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardSummary, Card, CardPriority, RecurrenceRule } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { CostSheet, formatCostChip } from "@/components/cost-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { PrioritySheet } from "@/components/priority-control";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { RichTextView, SheetAction } from "@/components/rich-text-view";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/state-views";
import { AppText } from "@/components/text";
import { Toast, type ToastMessage } from "@/components/toast";
import { useAuth } from "@/features/auth/auth-context";
import { MoveCardSheet } from "@/features/boards/move-card-sheet";
import { ActivityTimeline, commentsKey, historyKey } from "@/features/cards/activity-timeline";
import { AttachmentsSection } from "@/features/cards/attachments-section";
import { CardBoardsField, cardBoardsKey } from "@/features/cards/card-boards-field";
import { CommentComposer } from "@/features/cards/comment-composer";
import { DescriptionEditor } from "@/features/cards/description-editor";
import { MembersSheet } from "@/features/cards/members-sheet";
import { SubtasksSection } from "@/features/cards/subtasks-section";
import {
  AddCircle,
  DuePill,
  ExpandButton,
  FIELD_ICONS,
  FieldCard,
  FieldRow,
  HeaderIconButton,
  OptionalChip,
  PersonPill,
  PriorityPill,
  RowRemove,
  StatusPill,
  ValuePill,
  type IconName,
} from "@/features/cards/task-fields";
import { api } from "@/lib/api";
import { LIVE_REFETCH_MS, boardDetailKey, findCachedBoard, findCachedCard, recentClosedSince } from "@/lib/board-cache";
import { contextBoardId, listOnBoard, withMove } from "@/lib/card-boards";
import { useCurrencySymbol } from "@/lib/currency";
import { formatDueDate } from "@/lib/date";
import { formatHijri } from "@/lib/hijri";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { colors, fonts, radii, spacing } from "@/theme/tokens";

/** Stable fallback while the card loads, so `useAutoSavedIds` sees one empty list, not a new one per render. */
const NO_IDS: string[] = [];

type Sheet = "status" | "assignees" | "due" | "priority" | "recurrence" | "cost" | "access" | "boards" | "menu" | null;

/**
 * `/card/:id` — 6b «تعديل مهمة» and 6d «التعليقات والسجل» in
 * `Tasks Mobile Redesign.dc.html`: the add screen's rows and icons in the
 * same places, and no «حفظ» / «إلغاء» — every change saves the moment it is
 * made and the header says «✓ حُفظ». The title and description are edited
 * in place (⤢ opens the full-screen editor, 6c) and save when the field is
 * left; every other row opens a small sheet for that field alone. A status
 * or assignee change offers «تراجع». Empty optional fields wait as dashed
 * chips for whoever may fill them. Below the subtasks, comments and history
 * share one timeline, and the comment field stays fixed at the bottom. Once
 * the title scrolls away, the header takes it over, with the status and due
 * date beneath.
 *
 * Who may change what is unchanged: the task's owner (a board owner or its
 * creator) edits its details; every member moves it, ticks subtasks,
 * comments and attaches; viewers and supervisors only read.
 */
export default function CardDetailScreen() {
  const params = useLocalSearchParams<{ id: string; boardId?: string }>();
  const id = params.id;
  const router = useRouter();
  const navigation = useNavigation();
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
  // A task can be on several boards (docs/18-multi-board-tasks.md): the screen
  // works in the one it was opened from while the task is still on it, else in
  // one of the user's own — the boards list is only fetched to find that one.
  const placements = card.data?.placements;
  const openedBoardGone = !!placements && !placements.some((p) => p.boardId === params.boardId);
  const myBoards = useQuery({
    queryKey: ["boards"],
    queryFn: () => api.boards.list(),
    enabled: openedBoardGone && placements.length > 1,
  });
  const myBoardIds = useMemo(() => (myBoards.data ? new Set(myBoards.data.map((b: BoardSummary) => b.id)) : undefined), [myBoards.data]);
  const boardId = contextBoardId(params.boardId, placements, myBoardIds);
  const board = useQuery({
    queryKey: boardDetailKey(boardId ?? "", "recent"),
    queryFn: () => api.boards.get(boardId!, recentClosedSince()),
    enabled: !!boardId,
    initialData: () => (boardId ? findCachedBoard(queryClient, boardId)?.data : undefined),
    initialDataUpdatedAt: () => (boardId ? findCachedBoard(queryClient, boardId)?.updatedAt : undefined),
    refetchInterval: LIVE_REFETCH_MS,
  });
  // Everyone on any of the task's boards — whom it can be assigned to.
  const people = useQuery({ queryKey: ["cardPeople", id], queryFn: () => api.cards.people(id) });
  // Shared with the sections below; read here only to know whether to show them or their chip.
  const subtasks = useQuery({ queryKey: ["subtasks", id], queryFn: () => api.subtasks.list(id) });
  const attachments = useQuery({ queryKey: ["cardAttachments", id], queryFn: () => api.attachments.list(id) });

  const currencySymbol = useCurrencySymbol();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionEditorOpen, setDescriptionEditorOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [restrictedDraft, setRestrictedDraft] = useState(false);
  const [subtaskAddRequest, setSubtaskAddRequest] = useState(0);
  const [attachRequest, setAttachRequest] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const [collapsed, setCollapsed] = useState(false);
  const titleBottom = useRef(80);
  const timelineY = useRef(0);

  // The typed fields re-seed from the server while not being edited, so a
  // poll brings in other users' edits without overwriting what is being typed.
  useEffect(() => {
    if (!card.data) return;
    if (!editingTitle) setTitle(card.data.title);
    if (!editingDescription && !descriptionEditorOpen) setDescription(card.data.description ?? "");
  }, [card.data, editingTitle, editingDescription, descriptionEditorOpen]);

  // «✓ حُفظ»: shown once something on this screen has saved, «جارٍ الحفظ…» while anything is.
  const mutating = useIsMutating();
  const [hasSaved, setHasSaved] = useState(false);
  const wasMutating = useRef(false);
  useEffect(() => {
    if (wasMutating.current && mutating === 0) setHasSaved(true);
    wasMutating.current = mutating > 0;
  }, [mutating]);

  /** Refreshes the task and every board it shows on (plus `extraBoardIds`, e.g. ones it just left). */
  function invalidateCard(extraBoardIds: string[] = []) {
    void queryClient.invalidateQueries({ queryKey: ["card", id] });
    void queryClient.invalidateQueries({ queryKey: historyKey(id) });
    const boardIds = new Set([...(card.data?.placements ?? []).map((p) => p.boardId), ...extraBoardIds]);
    for (const b of boardIds) void queryClient.invalidateQueries({ queryKey: ["board", b] });
  }

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.cards.update>[1]) => api.cards.update(id, patch),
    onSuccess: (saved) => {
      queryClient.setQueryData<Card>(["card", id], (prev) => (prev ? { ...prev, ...saved } : saved));
      invalidateCard();
    },
  });

  // Leaving with the title or description still focused: their blur may not
  // fire before the screen goes, so save whatever differs on the way out.
  const pendingText = useRef({ title, description });
  pendingText.current = { title, description };
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        const current = queryClient.getQueryData<Card>(["card", id]);
        if (!current) return;
        const patch: { title?: string; description?: string | null } = {};
        const { title: t, description: d } = pendingText.current;
        if (t.trim() && t.trim() !== current.title) patch.title = t.trim();
        if (d !== (current.description ?? "")) patch.description = d || null;
        if (Object.keys(patch).length > 0) {
          void api.cards.update(id, patch).then(() => invalidateCard());
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs; registering once is the point
    [navigation, id],
  );

  function saveTitle() {
    setEditingTitle(false);
    const next = title.trim();
    if (!card.data) return;
    if (!next) {
      setTitle(card.data.title);
      return;
    }
    if (next !== card.data.title) update.mutate({ title: next });
  }

  function saveDescription(next: string) {
    setEditingDescription(false);
    setDescription(next);
    if (card.data && next !== (card.data.description ?? "")) update.mutate({ description: next || null });
  }

  // The people rows save on every tick — there is no save button.
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
    onSuccess: () => invalidateCard(),
  });

  // The status move — optimistic, since the pill is its own confirmation.
  const moveCard = useMutation({
    mutationFn: (targetListId: string) => api.cards.update(id, { targetListId }),
    onMutate: async (targetListId) => {
      await queryClient.cancelQueries({ queryKey: ["card", id] });
      const previous = queryClient.getQueryData<Card>(["card", id]);
      if (previous && boardId) queryClient.setQueryData<Card>(["card", id], withMove(previous, boardId, targetListId));
      return { previous };
    },
    onError: (_err, _targetListId, context) => {
      if (context?.previous) queryClient.setQueryData(["card", id], context.previous);
      setToast({ id: Date.now(), message: "تعذّر تغيير الحالة — أُعيدت كما كانت." });
    },
    onSettled: () => invalidateCard(),
  });

  const removeCard = useMutation({
    mutationFn: () => api.cards.remove(id),
    onSuccess: () => {
      for (const p of card.data?.placements ?? []) void queryClient.invalidateQueries({ queryKey: ["board", p.boardId] });
      queryClient.removeQueries({ queryKey: ["card", id] });
      router.back();
    },
  });

  async function pullToRefresh() {
    setPullRefreshing(true);
    try {
      await Promise.all(
        [["card", id], ["board", boardId ?? ""], ["subtasks", id], ["cardAttachments", id], historyKey(id), commentsKey(id), cardBoardsKey(id), ["cardPeople", id]].map(
          (queryKey) => queryClient.refetchQueries({ queryKey, type: "active" }),
        ),
      );
    } finally {
      setPullRefreshing(false);
    }
  }

  if (card.isPending || (card.isSuccess && board.isPending)) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ padding: spacing.xl, gap: spacing.md }}>
        <Skeleton height={16} width="40%" />
        <Skeleton height={28} width="75%" />
        <Skeleton height={110} radius={20} />
        <Skeleton height={216} radius={20} />
      </Screen>
    );
  }

  if (card.isError || board.isError || !board.data) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ justifyContent: "center" }}>
        <ErrorState onRetry={() => void card.refetch()} />
      </Screen>
    );
  }

  const data = card.data;
  const boardData = board.data;
  // The task's column on the board this screen works in — not necessarily its home list.
  const listId = listOnBoard(data, boardId);
  const list = boardData.lists.find((l) => l.id === listId);
  const members = people.data ?? boardData.members;
  const memberById = (userId: string) => members.find((m) => m.userId === userId);
  const myRole = boardData.members.find((m) => m.userId === user?.id)?.role;
  // Opened from «المتابعة» without being a member: read-only like a viewer.
  const isSupervised = boardData.supervised;
  const isViewer = myRole === "VIEWER" || isSupervised;
  // An archived board refuses every write (`assertBoardMutable`).
  const readOnly = isViewer || boardData.isArchived;
  // Only the task's owner — board owner or creator — edits its details.
  const canEdit = !readOnly && (user?.id === boardData.ownerId || user?.id === data.createdById);
  // §3c-4 "منتقي المسؤولين لا يعرض المشاهدين".
  const assignableMembers = members.filter((m) => m.role !== "VIEWER");
  const accessMembers = members.filter((m) => m.userId !== boardData.ownerId && m.userId !== data.createdById);
  const listIndex = boardData.lists.findIndex((l) => l.id === listId);
  const nextListId = boardData.lists[listIndex + 1]?.id ?? null;
  // §3b-4: only the board owner or this task's assignees may move it into «انتهى».
  const canCloseCard = !!user && (boardData.ownerId === user.id || data.assigneeIds.includes(user.id));
  const restricted = data.isRestricted || restrictedDraft;
  const subtaskCount = subtasks.data?.length ?? 0;
  const attachmentCount = attachments.data?.length ?? 0;
  const showSubtasks = subtaskCount > 0 || (canEdit && subtaskAddRequest > 0);
  const showAttachments = attachmentCount > 0 || (!readOnly && attachRequest > 0);
  const mentionNames = members.flatMap((m) => [m.user.displayName, m.user.firstName]).filter(Boolean);

  function moveTo(targetListId: string) {
    setSheet(null);
    const fromListId = listId;
    const target = boardData.lists.find((l) => l.id === targetListId);
    moveCard.mutate(targetListId, {
      onSuccess: () =>
        setToast({
          id: Date.now(),
          message: `نُقلت إلى «${target?.name ?? ""}»`,
          actionLabel: "تراجع",
          onAction: () => moveCard.mutate(fromListId),
        }),
    });
  }

  function changeAssignees(next: string[]) {
    const before = assigneeSelection.ids;
    assigneeSelection.change(next);
    const added = next.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !next.includes(x));
    const addedName = added.length === 1 ? memberById(added[0]!)?.user.firstName : undefined;
    setToast({
      id: Date.now(),
      message:
        added.length === 1 && removed.length === 0 && addedName
          ? `أُسندت إلى ${addedName}`
          : added.length === 0 && removed.length > 0
            ? "أُزيل الإسناد"
            : "تغيّر المسؤولون",
      actionLabel: "تراجع",
      onAction: () => assigneeSelection.change(before),
    });
  }

  // Empty optional fields, as chips for whoever may fill them.
  const chips: { key: string; icon: IconName; label: string; onPress: () => void }[] = [];
  if (canEdit) {
    if (!data.dueDate) chips.push({ key: "due", icon: FIELD_ICONS.due, label: "موعد", onPress: () => setSheet("due") });
    if (data.dueDate && !data.recurrence) chips.push({ key: "recurrence", icon: FIELD_ICONS.recurrence, label: "تكرار", onPress: () => setSheet("recurrence") });
    if (data.priority === "NORMAL") chips.push({ key: "priority", icon: FIELD_ICONS.priority, label: "أولوية", onPress: () => setSheet("priority") });
    if (!showSubtasks) chips.push({ key: "subtasks", icon: FIELD_ICONS.subtasks, label: "مهام فرعية", onPress: () => setSubtaskAddRequest((n) => n + 1) });
  }
  if (!readOnly && !showAttachments) chips.push({ key: "attach", icon: FIELD_ICONS.attachments, label: "مرفق", onPress: () => setAttachRequest((n) => n + 1) });
  if (canEdit) {
    if (!data.costAmount) chips.push({ key: "cost", icon: FIELD_ICONS.cost, label: "التكلفة", onPress: () => setSheet("cost") });
    if (!restricted)
      chips.push({
        key: "access",
        icon: FIELD_ICONS.access,
        label: "تقييد الوصول",
        onPress: () => {
          setRestrictedDraft(true);
          setSheet("access");
        },
      });
  }

  // The rows: always status and people; the rest only once they hold a value.
  const rows: ReactNode[] = [];
  rows.push(
    <FieldRow
      key="status"
      icon={FIELD_ICONS.status}
      onPress={readOnly ? undefined : () => setSheet("status")}
      accessibilityLabel={`الحالة: ${list?.name ?? ""}. اضغط للنقل إلى حالة أخرى`}
    >
      <StatusPill name={list?.name ?? "—"} category={list?.statusCategory} editable={!readOnly} />
    </FieldRow>,
  );
  rows.push(
    <FieldRow key="assignees" icon={FIELD_ICONS.assignees} onPress={canEdit ? () => setSheet("assignees") : undefined} accessibilityLabel="المسؤولون. اضغط للتغيير">
      {assigneeSelection.ids.length === 0 && !canEdit ? (
        <AppText size="small" color={colors.muted}>
          لا يوجد مسؤولون
        </AppText>
      ) : null}
      {assigneeSelection.ids.map((userId) => {
        const member = memberById(userId);
        return member ? <PersonPill key={userId} member={member} isMe={userId === user?.id} /> : null;
      })}
      {canEdit ? <AddCircle /> : null}
      {assigneeSelection.failed ? (
        <AppText size="caption" color={colors.alert}>
          تعذّر الحفظ
        </AppText>
      ) : null}
    </FieldRow>,
  );
  if (data.dueDate) {
    rows.push(
      <FieldRow key="due" icon={FIELD_ICONS.due} onPress={canEdit ? () => setSheet("due") : undefined} accessibilityLabel="الموعد. اضغط للتغيير">
        <View style={{ gap: 2 }}>
          <DuePill iso={data.dueDate} />
          {/* §3c-2 "التاريخ الهجري" — a secondary line under the due date. */}
          <AppText color={colors.muted} style={{ fontSize: 11, lineHeight: 16, paddingHorizontal: 4 }}>
            الموافق {formatHijri(new Date(data.dueDate))}
          </AppText>
        </View>
      </FieldRow>,
    );
  }
  if (data.recurrence) {
    rows.push(
      <FieldRow key="recurrence" icon={FIELD_ICONS.recurrence} onPress={canEdit ? () => setSheet("recurrence") : undefined} accessibilityLabel="التكرار. اضغط للتغيير">
        <ValuePill text={`↻ ${summarizeRecurrence(data.recurrence)}`} />
      </FieldRow>,
    );
  }
  if (data.priority !== "NORMAL") {
    rows.push(
      <FieldRow key="priority" icon={FIELD_ICONS.priority} onPress={canEdit ? () => setSheet("priority") : undefined} accessibilityLabel="الأولوية. اضغط للتغيير">
        <PriorityPill priority={data.priority} />
      </FieldRow>,
    );
  }
  if (data.costAmount) {
    rows.push(
      <FieldRow key="cost" icon={FIELD_ICONS.cost} onPress={canEdit ? () => setSheet("cost") : undefined} accessibilityLabel="التكلفة. اضغط للتغيير">
        <ValuePill text={formatCostChip(data.costAmount, data.costNote, currencySymbol)} />
      </FieldRow>,
    );
  }
  if (restricted) {
    rows.push(
      <FieldRow key="access" icon={FIELD_ICONS.access} onPress={canEdit ? () => setSheet("access") : undefined} accessibilityLabel="من يرى المهمة">
        {accessSelection.ids.length === 0 ? (
          <ValuePill text="المالك والمُنشئ فقط" />
        ) : (
          accessSelection.ids.map((userId) => {
            const member = memberById(userId);
            return member ? <PersonPill key={userId} member={member} isMe={userId === user?.id} /> : null;
          })
        )}
        {canEdit ? <AddCircle /> : null}
        {canEdit ? (
          <RowRemove
            label="تقييد الوصول"
            onPress={() => {
              setRestrictedDraft(false);
              if (data.isRestricted) unrestrict.mutate();
            }}
          />
        ) : null}
      </FieldRow>,
    );
  }
  if (data.placements.length > 1) {
    rows.push(
      <FieldRow key="boards" icon={FIELD_ICONS.boards} onPress={() => setSheet("boards")} accessibilityLabel="لوحات المهمة">
        <ValuePill text={`على ${data.placements.length} لوحات`} />
      </FieldRow>,
    );
  }

  const saveLabel = mutating > 0 ? "جارٍ الحفظ…" : hasSaved ? "✓ حُفظ" : "";

  return (
    <Screen edges={{ top: true, bottom: true }}>
      {/* Header: breadcrumb + save state; once the title scrolls away, the title with status and due date. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingTop: 4,
          paddingBottom: collapsed ? spacing.sm : 4,
          paddingHorizontal: spacing.md,
          borderBottomWidth: collapsed ? 1 : 0,
          borderBottomColor: colors.line,
        }}
      >
        <HeaderIconButton icon="chevron-forward" accessibilityLabel="رجوع" onPress={() => router.back()} />
        {collapsed ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText size="small" weight="bold" numberOfLines={1} style={{ fontSize: 14, lineHeight: 21 }}>
              {data.title}
            </AppText>
            <AppText color={colors.muted} numberOfLines={1} style={{ fontSize: 11, lineHeight: 16 }}>
              {list?.name ?? ""}
              {data.dueDate ? ` · ◷ ${formatDueDate(data.dueDate)}` : ""}
            </AppText>
          </View>
        ) : (
          <AppText size="caption" color={colors.muted} numberOfLines={1} style={{ flex: 1 }}>
            {boardData.name}
          </AppText>
        )}
        {saveLabel ? (
          <AppText weight="semibold" color={mutating > 0 ? colors.muted : colors.saved} style={{ fontSize: 11, lineHeight: 16 }}>
            {saveLabel}
          </AppText>
        ) : null}
        <HeaderIconButton icon="ellipsis-horizontal" accessibilityLabel="خيارات المهمة" onPress={() => setSheet("menu")} />
      </View>

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(event) => {
          const next = event.nativeEvent.contentOffset.y > titleBottom.current;
          if (next !== collapsed) setCollapsed(next);
        }}
        refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void pullToRefresh()} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      >
        {isViewer || !canEdit ? (
          <View style={{ marginHorizontal: spacing.lg, marginTop: 4, backgroundColor: colors.chip, borderRadius: radii.field, paddingVertical: 6, paddingHorizontal: spacing.md }}>
            <AppText size="caption" color={colors.subtle} style={{ textAlign: "center" }}>
              {isSupervised
                ? "وضع المتابعة — للقراءة فقط"
                : isViewer
                  ? "للعرض فقط — أنت مشاهد في هذه اللوحة"
                  : boardData.isArchived
                    ? "اللوحة مؤرشفة — للقراءة فقط"
                    : "يعدّل التفاصيل مالكُ المهمة — يمكنك تغيير حالتها والتعليق وإنجاز المهام الفرعية وإرفاق الملفات"}
            </AppText>
          </View>
        ) : null}

        <View
          style={{ paddingTop: 6, paddingBottom: spacing.md, paddingHorizontal: spacing.xl }}
          onLayout={(event) => {
            titleBottom.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height - 8;
          }}
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            onFocus={() => setEditingTitle(true)}
            onBlur={saveTitle}
            editable={canEdit}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            accessibilityLabel="عنوان المهمة"
            style={{
              fontFamily: fonts.bold,
              fontSize: 22,
              lineHeight: 33,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
              padding: 0,
            }}
          />
        </View>

        {/* The description first, in full and larger than the other fields; links open with a tap. */}
        {data.description || canEdit ? (
          <View
            style={{
              marginHorizontal: spacing.lg,
              marginBottom: spacing.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: editingDescription ? colors.accent : colors.line,
              borderRadius: 20,
              paddingVertical: 14,
              paddingHorizontal: spacing.lg,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              {editingDescription ? (
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onBlur={() => saveDescription(description)}
                  autoFocus
                  multiline
                  scrollEnabled={false}
                  placeholder="أضف وصفًا أو الصق رابطًا…"
                  placeholderTextColor={colors.faint}
                  accessibilityLabel="الوصف"
                  style={{ minHeight: 60, fontFamily: fonts.regular, fontSize: 15, lineHeight: 29, color: colors.ink, textAlign: "right", textAlignVertical: "top", writingDirection: "rtl", padding: 0 }}
                />
              ) : description ? (
                <Pressable
                  accessibilityRole={canEdit ? "button" : undefined}
                  accessibilityLabel={canEdit ? "تعديل الوصف" : undefined}
                  disabled={!canEdit}
                  onPress={() => setEditingDescription(true)}
                >
                  <RichTextView
                    text={description}
                    mentionNames={mentionNames}
                    fontSize={15}
                    lineHeight={29}
                    onEditLink={canEdit ? () => setDescriptionEditorOpen(true) : undefined}
                  />
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setEditingDescription(true)} style={{ minHeight: 44, justifyContent: "center" }}>
                  <AppText color={colors.faint} style={{ fontSize: 15, lineHeight: 29 }}>
                    أضف وصفًا أو الصق رابطًا…
                  </AppText>
                </Pressable>
              )}
            </View>
            {canEdit ? <ExpandButton onPress={() => setDescriptionEditorOpen(true)} /> : null}
          </View>
        ) : null}

        <View style={{ marginHorizontal: spacing.lg }}>
          <FieldCard>
            {rows.map((row, index) => (
              <View key={index} style={{ borderBottomWidth: index < rows.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                {row}
              </View>
            ))}
          </FieldCard>
        </View>

        {chips.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.md, paddingHorizontal: spacing.lg }}>
            {chips.map((chip) => (
              <OptionalChip key={chip.key} icon={chip.icon} label={chip.label} onPress={chip.onPress} />
            ))}
          </View>
        ) : null}

        {showSubtasks ? (
          <View style={{ marginTop: spacing.md, marginHorizontal: spacing.lg }}>
            <SubtasksSection cardId={id} boardMembers={assignableMembers} readOnly={readOnly} canEdit={canEdit} addRequest={subtaskAddRequest} />
          </View>
        ) : null}

        {showAttachments ? (
          <View style={{ marginTop: spacing.lg, marginHorizontal: spacing.lg }}>
            <AttachmentsSection cardId={id} readOnly={readOnly} canManage={canEdit} openRequest={attachRequest} />
          </View>
        ) : null}

        <View
          style={{ marginTop: spacing.lg, marginHorizontal: spacing.lg }}
          onLayout={(event) => {
            timelineY.current = event.nativeEvent.layout.y;
          }}
        >
          <ActivityTimeline
            cardId={id}
            lists={boardData.lists}
            members={members}
            onJump={() => scrollRef.current?.scrollTo({ y: timelineY.current - spacing.sm, animated: true })}
          />
        </View>
      </ScrollView>

      {toast ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </View>
      ) : null}

      {/* §3c-4: a viewer reads the task in full but gets no comment field. */}
      {!isViewer && !boardData.isArchived ? <CommentComposer cardId={id} members={members} /> : null}

      <DescriptionEditor
        visible={descriptionEditorOpen}
        taskTitle={data.title}
        initialText={description}
        members={assignableMembers}
        onDone={(text) => {
          setDescriptionEditorOpen(false);
          saveDescription(text);
        }}
        onCancel={() => setDescriptionEditorOpen(false)}
      />

      <MoveCardSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        card={{ listId }}
        lists={boardData.lists}
        nextListId={nextListId}
        canCloseCard={canCloseCard}
        onMove={moveTo}
      />

      <MembersSheet
        visible={sheet === "assignees"}
        onClose={() => setSheet(null)}
        title="المسؤولون"
        members={assignableMembers}
        lookup={members}
        selectedIds={assigneeSelection.ids}
        onChange={changeAssignees}
        meId={user?.id}
        saving={assigneeSelection.saving}
        failed={assigneeSelection.failed}
      />

      <MembersSheet
        visible={sheet === "access"}
        onClose={() => setSheet(null)}
        title="من يرى المهمة"
        members={accessMembers}
        lookup={members}
        selectedIds={accessSelection.ids}
        onChange={accessSelection.change}
        meId={user?.id}
        note="مالك اللوحة ومُنشئ المهمة يملكان الوصول دائمًا."
        saving={accessSelection.saving}
        failed={accessSelection.failed}
      />

      <DueDateSheet
        visible={sheet === "due"}
        onClose={() => setSheet(null)}
        value={data.dueDate}
        onChange={(dueDate) => update.mutate({ dueDate })}
      />

      <RecurrenceSheet
        visible={sheet === "recurrence"}
        onClose={() => setSheet(null)}
        value={data.recurrence}
        onChange={(recurrence: RecurrenceRule | null) => update.mutate({ recurrence })}
      />

      <PrioritySheet
        visible={sheet === "priority"}
        onClose={() => setSheet(null)}
        value={data.priority}
        onChange={(priority: CardPriority) => update.mutate({ priority }, { onSuccess: () => setSheet(null) })}
        saving={update.isPending}
        failed={update.isError}
      />

      <CostSheet
        visible={sheet === "cost"}
        onClose={() => setSheet(null)}
        amount={data.costAmount}
        note={data.costNote}
        saving={update.isPending}
        onSave={(costAmount, costNote) => update.mutate({ costAmount, costNote }, { onSuccess: () => setSheet(null) })}
      />

      {/* ⋯: the task's boards, and delete — set apart, through the shared confirm sheet. */}
      <BottomSheet visible={sheet === "menu"} onClose={() => setSheet(null)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <SheetAction label="لوحات المهمة" onPress={() => setSheet("boards")} />
          {canEdit ? (
            <SheetAction
              label="حذف المهمة"
              destructive
              onPress={() => {
                setSheet(null);
                setConfirmingDelete(true);
              }}
            />
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === "boards"} onClose={() => setSheet(null)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          <AppText weight="bold" size="title">
            لوحات المهمة
          </AppText>
          <CardBoardsField
            cardId={id}
            readOnly={readOnly}
            onSaved={(boardIds) => {
              invalidateCard(boardIds);
              // The boards list counts each board's tasks, and this just changed which boards hold one.
              void queryClient.invalidateQueries({ queryKey: ["boards"] });
            }}
          />
          <AppText size="caption" color={colors.muted}>
            للمهمة حالة واحدة على كل لوحاتها.
          </AppText>
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="حذف المهمة"
        consequence="تُحذف المهمة ومهامها الفرعية ومرفقاتها."
        confirmLabel="حذف"
        confirming={removeCard.isPending}
        onConfirm={() => removeCard.mutate()}
      />
    </Screen>
  );
}
