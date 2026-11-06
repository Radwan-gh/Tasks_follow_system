import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardMember, BoardSummary, Card, CardActivity, CardPriority, List, RecurrenceRule } from "@app/types";
import { CostSheet, formatCostChip } from "@/components/cost-sheet";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { RichTextView } from "@/components/rich-text-view";
import { Screen } from "@/components/screen";
import { ErrorState } from "@/components/state-views";
import { useAuth } from "@/features/auth/auth-context";
import { ACTIVITY_PAGE, MenuRow, TaskActivity, TaskComposer, commentsKey, historyKey } from "@/features/task/task-activity";
import { TaskAttachments, attachmentsKey } from "@/features/task/task-attachments";
import { TaskBoardsRow, cardBoardsKey } from "@/features/task/task-boards-row";
import { DescriptionCard, DescriptionFullScreen } from "@/features/task/task-description";
import { AssigneesCard } from "@/features/task/task-people";
import { StatusSheet, TASK_PRIORITY_LABELS, TaskDueSheet, TaskPrioritySheet } from "@/features/task/task-sheets";
import { TaskSubtasks, subtasksKey } from "@/features/task/task-subtasks";
import { NEUTRAL_PILL, SectionChip, SectionHeader, TAvatar, TCard, TDialog, TPill, TText, TopToast, type PillColors } from "@/features/task/task-ui";
import { api } from "@/lib/api";
import { LIVE_REFETCH_MS, boardDetailKey, findCachedBoard, findCachedCard, recentClosedSince } from "@/lib/board-cache";
import { contextBoardId, listOnBoard, withMove } from "@/lib/card-boards";
import { useCurrencySymbol } from "@/lib/currency";
import { daysFromToday, dueLabel, formatDayMonth } from "@/lib/task-format";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { t, taskFonts, taskPriorityColors, taskRadii, taskStatusColors } from "@/theme/task-tokens";
import { GUTTER } from "@/theme/tokens";

/** Stable fallback while the card loads, so `useAutoSavedIds` sees one empty list, not a new one per render. */
const NO_IDS: string[] = [];

type Sheet = "status" | "priority" | "due" | "recurrence" | "cost" | null;

const isDoneCategory = (list: List | undefined) => list?.statusCategory === "DONE" || list?.statusCategory === "CLOSED";

/** «يراها 3 أعضاء فقط» — who can see a restricted task, its owner and creator included. */
function accessNote(viewerIds: ReadonlySet<string>, meId: string | undefined): string {
  const n = viewerIds.size;
  if (n <= 1) return meId && viewerIds.has(meId) ? "أنت فقط ترى هذه المهمة" : "يراها شخص واحد فقط";
  if (n === 2) return "يراها عضوان فقط";
  const lastTwo = n % 100;
  return `يراها ${n} ${lastTwo >= 3 && lastTwo <= 10 ? "أعضاء" : "عضوًا"} فقط`;
}

/**
 * `/card/:id` — the task screen, after `Edit Task Prototype.dc.html`
 * (docs/app_design/proposals/tasks page new design), in that prototype's own
 * look (`theme/task-tokens.ts`, Noto Naskh Arabic).
 *
 * Top to bottom: a «مكتملة» banner with «إعادة فتح» once the task is done; the
 * title in its own card; «في [لوحة] + لوحة»; the description (⤢ opens it full
 * screen); the assignees card; one row of pills — due, priority, status (and
 * the app's repeat and cost, which the prototype lacks); the optional
 * sections — subtasks, attachments, who can see it — each closable, and the
 * chips that open the closed ones; then «النشاط», five entries at a time.
 * The comment bar stays at the bottom. Everything saves the moment it changes:
 * the header says «جارٍ الحفظ…», «حُفظ», or «تعذّر الحفظ · إعادة».
 *
 * Whoever may not edit the task's details (anyone but its owner — a board
 * owner or its creator) gets the prototype's read-only layout: a «صلاحيتك عرض
 * فقط» banner and labelled rows; members can still change the status, tick
 * subtasks, attach and comment. ⋯ holds copy link, duplicate and delete;
 * delete can be undone for 30 seconds.
 */
export default function CardDetailScreen() {
  const params = useLocalSearchParams<{ id: string; boardId?: string }>();
  const id = params.id;
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [deleted, setDeleted] = useState<{ restoreUntil: number } | null>(null);

  // Seeded from the board on screen by `useOpenCard`, then refreshed and polled (`lib/board-cache.ts`).
  const card = useQuery({
    queryKey: ["card", id],
    queryFn: () => api.cards.get(id),
    initialData: () => findCachedCard(queryClient, id, params.boardId)?.card,
    initialDataUpdatedAt: () => findCachedCard(queryClient, id, params.boardId)?.updatedAt,
    refetchInterval: LIVE_REFETCH_MS,
    // A task pending deletion answers 404; stop asking while «تراجع» is on offer.
    enabled: !deleted,
  });
  // A task can be on several boards (docs/18-multi-board-tasks.md): work in the one it was opened from.
  const placements = card.data?.placements;
  const openedBoardGone = !!placements && !placements.some((p) => p.boardId === params.boardId);
  const myBoards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list(), enabled: openedBoardGone && placements.length > 1 });
  const myBoardIds = useMemo(() => (myBoards.data ? new Set(myBoards.data.map((b: BoardSummary) => b.id)) : undefined), [myBoards.data]);
  const boardId = contextBoardId(params.boardId, placements, myBoardIds);
  const board = useQuery({
    queryKey: boardDetailKey(boardId ?? "", "recent"),
    queryFn: () => api.boards.get(boardId!, recentClosedSince()),
    enabled: !!boardId && !deleted,
    initialData: () => (boardId ? findCachedBoard(queryClient, boardId)?.data : undefined),
    initialDataUpdatedAt: () => (boardId ? findCachedBoard(queryClient, boardId)?.updatedAt : undefined),
    refetchInterval: LIVE_REFETCH_MS,
  });
  const people = useQuery({ queryKey: ["cardPeople", id], queryFn: () => api.cards.people(id), enabled: !deleted });
  const subtasks = useQuery({ queryKey: subtasksKey(id), queryFn: () => api.subtasks.list(id), enabled: !deleted });
  const attachments = useQuery({ queryKey: attachmentsKey(id), queryFn: () => api.attachments.list(id), enabled: !deleted });
  const history = useQuery({ queryKey: historyKey(id), queryFn: () => api.cards.history(id), enabled: !deleted });
  const cardBoards = useQuery({ queryKey: cardBoardsKey(id), queryFn: () => api.cards.boards(id), enabled: !deleted });
  const currencySymbol = useCurrencySymbol();

  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [fullDescription, setFullDescription] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [subOpened, setSubOpened] = useState(0);
  const [attOpened, setAttOpened] = useState(0);
  const [accessDraft, setAccessDraft] = useState(false);
  const [shown, setShown] = useState(ACTIVITY_PAGE);
  // «النشاط» starts collapsed; it opens on tap, or when you post a comment.
  const [activityOpen, setActivityOpen] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Save state: what is in flight, and how to retry what failed.
  const [childBusy, setChildBusy] = useState({ subtasks: false, attachments: false });
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const onSubtasksBusy = useCallback((busy: boolean) => setChildBusy((s) => (s.subtasks === busy ? s : { ...s, subtasks: busy })), []);
  const onAttachmentsBusy = useCallback((busy: boolean) => setChildBusy((s) => (s.attachments === busy ? s : { ...s, attachments: busy })), []);
  const onFailed = useCallback((again: () => void) => setRetry(() => again), []);

  useEffect(() => {
    if (card.data && !editingTitle) setTitle(card.data.title);
  }, [card.data, editingTitle]);

  // The «تراجع» countdown.
  useEffect(() => {
    if (!deleted) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deleted]);

  function refreshBoards(extraBoardIds: string[] = []) {
    const ids = new Set([...(card.data?.placements ?? []).map((p) => p.boardId), ...extraBoardIds]);
    for (const b of ids) void queryClient.invalidateQueries({ queryKey: ["board", b] });
  }

  function invalidateCard(extraBoardIds: string[] = []) {
    void queryClient.invalidateQueries({ queryKey: ["card", id] });
    void queryClient.invalidateQueries({ queryKey: historyKey(id) });
    refreshBoards(extraBoardIds);
  }

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.cards.update>[1]) => api.cards.update(id, patch),
    onSuccess: (saved) => {
      setRetry(null);
      queryClient.setQueryData<Card>(["card", id], (prev) => (prev ? { ...prev, ...saved } : saved));
      invalidateCard();
    },
    onError: (_e, patch) => setRetry(() => () => update.mutate(patch)),
  });

  const moveCard = useMutation({
    mutationFn: (targetListId: string) => api.cards.update(id, { targetListId }),
    onMutate: async (targetListId) => {
      await queryClient.cancelQueries({ queryKey: ["card", id] });
      const previous = queryClient.getQueryData<Card>(["card", id]);
      if (previous && boardId) queryClient.setQueryData<Card>(["card", id], withMove(previous, boardId, targetListId));
      return { previous };
    },
    onSuccess: () => setRetry(null),
    onError: (_e, targetListId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["card", id], ctx.previous);
      setRetry(() => () => moveCard.mutate(targetListId));
    },
    onSettled: () => invalidateCard(),
  });

  const assigneeSelection = useAutoSavedIds(card.data?.assigneeIds ?? NO_IDS, async (userIds) => {
    await api.cards.updateAssignees(id, { userIds });
    invalidateCard();
  });
  const accessSelection = useAutoSavedIds(card.data?.memberIds ?? NO_IDS, async (memberUserIds) => {
    await api.cards.updateAccess(id, { isRestricted: true, memberUserIds });
    invalidateCard();
  });
  const lastAssignees = useRef<string[]>([]);
  const lastAccess = useRef<string[]>([]);
  useEffect(() => {
    if (assigneeSelection.failed) setRetry(() => () => assigneeSelection.change(lastAssignees.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on failure only
  }, [assigneeSelection.failed]);
  useEffect(() => {
    if (accessSelection.failed) setRetry(() => () => accessSelection.change(lastAccess.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on failure only
  }, [accessSelection.failed]);

  const unrestrict = useMutation({
    mutationFn: () => api.cards.updateAccess(id, { isRestricted: false, memberUserIds: [] }),
    onSuccess: () => {
      setRetry(null);
      invalidateCard();
    },
    onError: () => setRetry(() => () => unrestrict.mutate()),
  });

  const duplicate = useMutation({
    mutationFn: () => api.cards.duplicate(id),
    onSuccess: () => {
      setToast("أُنشئت نسخة من المهمة");
      refreshBoards();
    },
    onError: () => setToast("تعذّر إنشاء نسخة — حاول مرة أخرى"),
  });

  const remove = useMutation({
    mutationFn: () => api.cards.remove(id),
    onSuccess: (result) => {
      setConfirmingDelete(false);
      setDeleted({ restoreUntil: new Date(result.restoreUntil).getTime() });
      setNow(Date.now());
      refreshBoards();
    },
    onError: () => {
      setConfirmingDelete(false);
      setToast("تعذّر حذف المهمة — حاول مرة أخرى");
    },
  });

  const restore = useMutation({
    mutationFn: () => api.cards.restore(id),
    onSuccess: () => {
      setDeleted(null);
      setToast("استُعيدت المهمة");
      invalidateCard();
    },
    onError: () => setToast("انتهت مهلة التراجع"),
  });

  // Leaving with the title still focused: its blur may not fire first, so save it on the way out.
  const titleRef = useRef(title);
  titleRef.current = title;
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        const current = queryClient.getQueryData<Card>(["card", id]);
        const next = titleRef.current.trim();
        if (current && next && next !== current.title) void api.cards.update(id, { title: next }).then(() => invalidateCard());
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs; registering once is the point
    [navigation, id],
  );

  async function pullToRefresh() {
    setPullRefreshing(true);
    try {
      await Promise.all(
        [["card", id], ["board", boardId ?? ""], subtasksKey(id), attachmentsKey(id), historyKey(id), commentsKey(id), cardBoardsKey(id), ["cardPeople", id]].map((queryKey) =>
          queryClient.refetchQueries({ queryKey, type: "active" }),
        ),
      );
    } finally {
      setPullRefreshing(false);
    }
  }

  // --- Deleted, loading, error ---------------------------------------------------
  if (deleted) {
    const pastRestore = now >= deleted.restoreUntil;
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: t.surface }}>
        <Header crumb={board.data?.name ?? ""} onBack={() => router.back()} saveState={null} />
        <View style={{ flex: 1, backgroundColor: t.canvas, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: t.chip, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="trash-outline" size={26} color={t.ink3} />
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <TText size={18} weight="bold">
              حُذفت المهمة
            </TText>
            <TText size={14} color={t.ink3}>
              {pastRestore ? "انتهت مهلة التراجع." : `يمكنك التراجع خلال ${Math.max(0, Math.ceil((deleted.restoreUntil - now) / 1000))} ثانية.`}
            </TText>
          </View>
          <View style={{ width: "100%", maxWidth: 240, gap: 8 }}>
            {!pastRestore ? (
              <Pressable
                accessibilityRole="button"
                disabled={restore.isPending}
                onPress={() => restore.mutate()}
                style={{ height: 46, borderRadius: 12, backgroundColor: t.ink, alignItems: "center", justifyContent: "center" }}
              >
                <TText size={15} weight="semibold" color={t.surface}>
                  {restore.isPending ? "جارٍ الاستعادة…" : "تراجع"}
                </TText>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ height: 44, alignItems: "center", justifyContent: "center" }}>
              <TText size={14} weight="semibold" color={t.accent}>
                العودة إلى اللوحة
              </TText>
            </Pressable>
          </View>
        </View>
        <TopToast message={toast} onDone={() => setToast(null)} top={insets.top + 60} />
      </Screen>
    );
  }

  if (card.isPending || (card.isSuccess && board.isPending)) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: t.surface }}>
        <Header crumb="" onBack={() => router.back()} saveState={null} />
        <LoadingSkeleton />
      </Screen>
    );
  }

  if (card.isError || board.isError || !board.data || !card.data) {
    return (
      <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: t.canvas, justifyContent: "center" }}>
        <ErrorState onRetry={() => void card.refetch()} />
      </Screen>
    );
  }

  const data = card.data;
  const boardData = board.data;
  const listId = listOnBoard(data, boardId);
  const list = boardData.lists.find((l) => l.id === listId);
  const members: BoardMember[] = people.data ?? boardData.members;
  const memberById = (userId: string) => members.find((m) => m.userId === userId);
  const me = user ? memberById(user.id) : undefined;
  const myRole = boardData.members.find((m) => m.userId === user?.id)?.role;
  const isSupervised = boardData.supervised;
  const isViewer = myRole === "VIEWER" || isSupervised;
  // An archived board refuses every write (`assertBoardMutable`).
  const boardLocked = isViewer || boardData.isArchived;
  // Only the task's owner — a board owner or its creator — edits its details.
  const canEdit = !boardLocked && (user?.id === boardData.ownerId || user?.id === data.createdById);
  const canMove = !boardLocked;
  // §3b-4: only the board owner or the task's assignees may move it into «انتهى».
  const canCloseCard = !!user && (boardData.ownerId === user.id || data.assigneeIds.includes(user.id));
  // §3c-4: viewers are never offered as assignees.
  const assignable = members.filter((m) => m.role !== "VIEWER");
  const accessCandidates = members.filter((m) => m.userId !== boardData.ownerId && m.userId !== data.createdById);
  const done = isDoneCategory(list);
  const restricted = data.isRestricted || accessDraft;
  const subOpen = (subtasks.data?.length ?? 0) > 0 || subOpened > 0;
  const attOpen = (attachments.data?.length ?? 0) > 0 || attOpened > 0;
  const mentionNames = members.flatMap((m) => [m.user.displayName, m.user.firstName]).filter(Boolean);
  const crumb = `${boardData.name}${data.placements.length > 1 ? ` +${data.placements.length - 1}` : ""}`;
  const saving =
    update.isPending || moveCard.isPending || assigneeSelection.saving || accessSelection.saving || unrestrict.isPending || childBusy.subtasks || childBusy.attachments;
  const saveState: "saving" | "saved" | "error" = retry ? "error" : saving ? "saving" : "saved";

  // Who finished it, and when — for the «مكتملة» banner.
  const finishedBy =
    done && list
      ? (history.data ?? [])
          .filter((a) => a.type === "MOVED" && a.toValue === list.name)
          .reduce<CardActivity | undefined>((latest, a) => (!latest || a.createdAt > latest.createdAt ? a : latest), undefined)
      : undefined;
  const finishedLine = (() => {
    if (!finishedBy) return "";
    const days = -daysFromToday(finishedBy.createdAt);
    const when = days === 0 ? "اليوم" : days === 1 ? "أمس" : formatDayMonth(finishedBy.createdAt);
    if (finishedBy.actor.id === user?.id) return `أنهيتها ${when}`;
    const who = memberById(finishedBy.actor.id)?.user.firstName || finishedBy.actor.displayName;
    return `أنهاها ${who} ${when}`;
  })();
  // «إعادة فتح» puts it back into the board's «قيد التنفيذ».
  const reopenListId = boardData.lists.find((l) => l.statusCategory === "IN_PROGRESS")?.id ?? boardData.lists[0]?.id;

  function moveTo(targetListId: string) {
    setSheet(null);
    if (targetListId !== listId) moveCard.mutate(targetListId);
  }

  function saveTitle() {
    setEditingTitle(false);
    const next = title.trim();
    if (!next) return setTitle(data.title);
    if (next !== data.title) update.mutate({ title: next });
  }

  // --- Pills ---------------------------------------------------------------------
  const due = data.dueDate ? dueLabel(data.dueDate, done) : null;
  const duePill: PillColors = !due
    ? NEUTRAL_PILL
    : due.tone === "overdue"
      ? { fg: t.dangerInk, bg: t.dangerSoft, border: t.dangerLine, icon: t.danger }
      : { fg: t.dueInk, bg: t.dueSoft, border: t.dueSoft, icon: t.dueIcon };
  const priority = data.priority;
  const prioritySwatch = taskPriorityColors[priority];
  const priorityPill: PillColors = prioritySwatch ? { fg: prioritySwatch.fg, bg: prioritySwatch.bg, border: prioritySwatch.bg, icon: prioritySwatch.dot } : NEUTRAL_PILL;
  const status = taskStatusColors[list?.statusCategory ?? "UNCATEGORIZED"];
  const statusPill: PillColors = { fg: status.fg, bg: status.bg, border: status.bg, icon: status.dot };

  const accessViewers = new Set([boardData.ownerId, data.createdById, ...accessSelection.ids]);
  const boardNames = cardBoards.data?.boards.map((b) => b.name) ?? [boardData.name];

  return (
    <Screen edges={{ top: true, bottom: true }} style={{ backgroundColor: t.surface }}>
      <Header
        crumb={crumb}
        onBack={() => router.back()}
        saveState={saveState}
        onRetry={() => {
          const again = retry;
          setRetry(null);
          again?.();
        }}
        onMenu={() => setMenuOpen(true)}
      />

      <View style={{ flex: 1, backgroundColor: t.canvas }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={64}
          onScroll={(e) => {
            // Five more activity entries each time the bottom comes into view.
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            if (activityOpen && contentOffset.y + layoutMeasurement.height >= contentSize.height - 40) setShown((n) => n + ACTIVITY_PAGE);
          }}
          refreshControl={<RefreshControl refreshing={pullRefreshing} onRefresh={() => void pullToRefresh()} />}
          contentContainerStyle={{ paddingTop: 16, paddingHorizontal: GUTTER, paddingBottom: 20, gap: 10 }}
        >
          {done ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.doneSoft, borderRadius: taskRadii.card, paddingVertical: 10, paddingStart: 12, paddingEnd: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: t.done, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="checkmark" size={16} color={t.surface} />
              </View>
              <View style={{ flex: 1 }}>
                <TText size={14} weight="bold" color={t.doneInk}>
                  {list?.statusCategory === "CLOSED" ? list.name : "مكتملة"}
                </TText>
                {finishedLine ? (
                  <TText size={12} color={t.doneInk}>
                    {finishedLine}
                  </TText>
                ) : null}
              </View>
              {canMove && reopenListId && reopenListId !== listId ? (
                <Pressable accessibilityRole="button" onPress={() => moveCard.mutate(reopenListId)} style={{ backgroundColor: t.surface, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 }}>
                  <TText size={13} weight="semibold" color={t.doneInk}>
                    إعادة فتح
                  </TText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!canEdit ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.chip, borderRadius: taskRadii.card, paddingVertical: 10, paddingHorizontal: 12 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="lock-closed-outline" size={16} color={t.ink2} />
              </View>
              <View style={{ flex: 1 }}>
                <TText size={14} weight="bold" color={t.ink2}>
                  {isSupervised ? "وضع المتابعة" : "صلاحيتك عرض فقط"}
                </TText>
                <TText size={12} color={t.ink3}>
                  {isSupervised
                    ? "تطّلع على المهمة دون تعديلها."
                    : isViewer
                      ? "أنت مشاهد في هذه اللوحة."
                      : boardData.isArchived
                        ? "اللوحة مؤرشفة — للقراءة فقط."
                        : "يمكنك تغيير الحالة، وإنجاز المهام الفرعية، والتعليق، وإرفاق الملفات."}
                </TText>
              </View>
            </View>
          ) : null}

          {canEdit ? (
            <>
              <TCard style={{ minHeight: 58, paddingVertical: 8, paddingHorizontal: 14, justifyContent: "center", borderColor: editingTitle ? t.accent : t.line }}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  onFocus={() => setEditingTitle(true)}
                  onBlur={saveTitle}
                  placeholder="عنوان المهمة"
                  placeholderTextColor={t.faint}
                  multiline
                  submitBehavior="blurAndSubmit"
                  returnKeyType="done"
                  accessibilityLabel="عنوان المهمة"
                  style={{ padding: 0, fontFamily: taskFonts.bold, fontSize: 19, lineHeight: 29, color: t.ink, textAlign: "right", writingDirection: "rtl" }}
                />
              </TCard>

              <TaskBoardsRow
                cardId={id}
                readOnly={boardLocked}
                statusName={list?.name ?? ""}
                onSaved={(boardIds) => {
                  invalidateCard(boardIds);
                  void queryClient.invalidateQueries({ queryKey: ["boards"] });
                }}
                onFailed={() => setRetry(() => () => void queryClient.invalidateQueries({ queryKey: cardBoardsKey(id) }))}
              />

              <DescriptionCard
                value={data.description ?? ""}
                editable
                mentionNames={mentionNames}
                onSave={(text) => update.mutate({ description: text || null })}
                onExpand={() => setFullDescription(true)}
              />

              <AssigneesCard
                members={assignable}
                lookup={members}
                selectedIds={assigneeSelection.ids}
                onChange={(ids) => {
                  lastAssignees.current = ids;
                  assigneeSelection.change(ids);
                }}
                meId={user?.id}
                canEdit
                failed={assigneeSelection.failed}
              />

              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <TPill label={due?.text ?? "موعد"} colors={duePill} icon="time-outline" onPress={() => setSheet("due")} accessibilityLabel={`الموعد: ${due?.text ?? "بدون"}`} />
                <TPill
                  label={prioritySwatch ? TASK_PRIORITY_LABELS[priority] : "أولوية"}
                  colors={priorityPill}
                  icon={prioritySwatch ? "flag" : "flag-outline"}
                  onPress={() => setSheet("priority")}
                  accessibilityLabel={`الأولوية: ${TASK_PRIORITY_LABELS[priority]}`}
                />
                <TPill label={list?.name ?? "—"} colors={statusPill} dot={status.dot} chevron onPress={() => setSheet("status")} accessibilityLabel={`الحالة: ${list?.name ?? ""}`} />
                {/* The app's repeat and cost — the prototype has neither; same pill, same place. */}
                {data.dueDate ? (
                  <TPill label={data.recurrence ? (summarizeRecurrence(data.recurrence) ?? "تكرار") : "تكرار"} colors={NEUTRAL_PILL} icon="repeat-outline" onPress={() => setSheet("recurrence")} />
                ) : null}
                <TPill
                  label={data.costAmount ? formatCostChip(data.costAmount, data.costNote, currencySymbol) : "التكلفة"}
                  colors={NEUTRAL_PILL}
                  icon="cash-outline"
                  onPress={() => setSheet("cost")}
                />
              </View>
            </>
          ) : (
            <ReadOnlyDetails
              title={data.title}
              description={data.description ?? ""}
              mentionNames={mentionNames}
              boardsLine={`في ${boardNames.join("، ")}`}
              statusLabel={list?.name ?? "—"}
              statusPill={statusPill}
              statusDot={status.dot}
              onStatus={canMove ? () => setSheet("status") : undefined}
              assignees={assigneeSelection.ids.map(memberById).filter((m): m is BoardMember => !!m)}
              meId={user?.id}
              due={due}
              priority={prioritySwatch ? { label: TASK_PRIORITY_LABELS[priority], color: prioritySwatch.dot } : null}
              recurrence={data.recurrence ? summarizeRecurrence(data.recurrence) : null}
              cost={data.costAmount ? formatCostChip(data.costAmount, data.costNote, currencySymbol) : null}
              onExpand={() => setFullDescription(true)}
            />
          )}

          {subOpen ? (
            <TaskSubtasks
              cardId={id}
              members={assignable}
              readOnly={boardLocked}
              canEdit={canEdit}
              focusRequest={subOpened}
              onCloseSection={() => setSubOpened(0)}
              onMutating={onSubtasksBusy}
              onFailed={onFailed}
            />
          ) : null}

          {attOpen ? (
            <TaskAttachments
              cardId={id}
              readOnly={boardLocked}
              canManage={canEdit}
              pickRequest={attOpened}
              onCloseSection={() => setAttOpened(0)}
              onMutating={onAttachmentsBusy}
            />
          ) : null}

          {restricted ? (
            <TCard style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              <SectionHeader
                icon="lock-closed-outline"
                title="من يرى المهمة"
                note={accessNote(accessViewers, user?.id)}
                onClose={
                  canEdit
                    ? () => {
                        setAccessDraft(false);
                        if (data.isRestricted) unrestrict.mutate();
                      }
                    : undefined
                }
                closeLabel="إلغاء تقييد الوصول"
              />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {(canEdit ? accessCandidates : accessCandidates.filter((m) => accessSelection.ids.includes(m.userId))).map((member) => {
                  const on = accessSelection.ids.includes(member.userId);
                  return (
                    <Pressable
                      key={member.userId}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: !canEdit }}
                      accessibilityLabel={member.user.displayName}
                      disabled={!canEdit}
                      onPress={() => {
                        const next = on ? accessSelection.ids.filter((x) => x !== member.userId) : [...accessSelection.ids, member.userId];
                        lastAccess.current = next;
                        accessSelection.change(next);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 7,
                        height: 34,
                        paddingStart: 4,
                        paddingEnd: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? t.accent : t.lineStrong,
                        backgroundColor: on ? t.accentSoft : t.surface,
                      }}
                    >
                      <TAvatar person={member} size={24} dim={!on} />
                      <TText size={13} weight="semibold" color={on ? t.ink : t.muted}>
                        {member.userId === user?.id ? "أنت" : member.user.firstName || member.user.displayName}
                      </TText>
                    </Pressable>
                  );
                })}
              </View>
            </TCard>
          ) : null}

          {!boardLocked && ((canEdit && (!subOpen || !restricted)) || !attOpen) ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {canEdit && !subOpen ? <SectionChip icon="checkbox-outline" label="مهام فرعية" onPress={() => setSubOpened((n) => n + 1)} /> : null}
              {/* Every member may attach (app rule), so this chip is not owner-only. */}
              {!attOpen ? <SectionChip icon="attach" label="مرفق" onPress={() => setAttOpened((n) => n + 1)} /> : null}
              {canEdit && !restricted ? <SectionChip icon="lock-closed-outline" label="تقييد الوصول" onPress={() => setAccessDraft(true)} /> : null}
            </View>
          ) : null}

          <TaskActivity cardId={id} members={members} shown={shown} open={activityOpen} onToggle={() => setActivityOpen((o) => !o)} />
        </ScrollView>

        {/* §3c-4: a viewer reads everything but gets no comment field. */}
        {!boardLocked ? <TaskComposer cardId={id} members={members} me={me} onSent={() => setActivityOpen(true)} /> : null}
      </View>

      <TopToast message={toast} onDone={() => setToast(null)} top={insets.top + 60} />

      {/* ⋯ */}
      <Modal visible={menuOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق القائمة" onPress={() => setMenuOpen(false)} style={{ flex: 1 }}>
          <View
            style={{
              position: "absolute",
              top: insets.top + 56,
              end: 10,
              width: 220,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.lineStrong,
              borderRadius: taskRadii.card,
              padding: 6,
              shadowColor: t.ink,
              shadowOpacity: 0.22,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 12 },
              elevation: 8,
            }}
          >
            <MenuRow
              icon="link-outline"
              label="نسخ رابط المهمة"
              onPress={() => {
                setMenuOpen(false);
                void Clipboard.setStringAsync(Linking.createURL(`card/${id}`, boardId ? { queryParams: { boardId } } : undefined));
                setToast("نُسخ رابط المهمة");
              }}
            />
            {canEdit ? (
              <>
                <MenuRow
                  icon="copy-outline"
                  label="تكرار المهمة"
                  onPress={() => {
                    setMenuOpen(false);
                    duplicate.mutate();
                  }}
                />
                <MenuRow
                  icon="trash-outline"
                  label="حذف المهمة"
                  danger
                  onPress={() => {
                    setMenuOpen(false);
                    setConfirmingDelete(true);
                  }}
                />
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      <TDialog visible={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.dangerSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="trash-outline" size={22} color={t.danger} />
        </View>
        <View style={{ gap: 4 }}>
          <TText size={18} weight="bold">
            حذف المهمة؟
          </TText>
          <TText size={14} color={t.ink3} lineHeight={24}>
            ستُحذف «{data.title}» من كل اللوحات، مع مهامها الفرعية ومرفقاتها وتعليقاتها.
          </TText>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => setConfirmingDelete(false)} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.canvas, alignItems: "center", justifyContent: "center" }}>
            <TText size={15} weight="semibold">
              إلغاء
            </TText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={remove.isPending}
            onPress={() => remove.mutate()}
            style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" }}
          >
            <TText size={15} weight="semibold" color={t.surface}>
              {remove.isPending ? "جارٍ الحذف…" : "حذف"}
            </TText>
          </Pressable>
        </View>
      </TDialog>

      <StatusSheet visible={sheet === "status"} onClose={() => setSheet(null)} lists={boardData.lists} currentListId={listId} canCloseCard={canCloseCard} onPick={moveTo} />
      <TaskPrioritySheet
        visible={sheet === "priority"}
        onClose={() => setSheet(null)}
        value={priority}
        onPick={(next: CardPriority) => {
          setSheet(null);
          if (next !== priority) update.mutate({ priority: next });
        }}
      />
      <TaskDueSheet
        visible={sheet === "due"}
        onClose={() => setSheet(null)}
        value={data.dueDate}
        onPick={(iso) => {
          setSheet(null);
          if (iso !== data.dueDate) update.mutate({ dueDate: iso });
        }}
      />
      <RecurrenceSheet visible={sheet === "recurrence"} onClose={() => setSheet(null)} value={data.recurrence} onChange={(recurrence: RecurrenceRule | null) => update.mutate({ recurrence })} />
      <CostSheet
        visible={sheet === "cost"}
        onClose={() => setSheet(null)}
        amount={data.costAmount}
        note={data.costNote}
        saving={update.isPending}
        onSave={(costAmount, costNote) => update.mutate({ costAmount, costNote }, { onSuccess: () => setSheet(null) })}
      />
      <DescriptionFullScreen
        visible={fullDescription}
        taskTitle={data.title}
        value={data.description ?? ""}
        editable={canEdit}
        onSave={(text) => update.mutate({ description: text || null })}
        onClose={() => setFullDescription(false)}
      />
    </Screen>
  );
}

function Header({
  crumb,
  onBack,
  saveState,
  onRetry,
  onMenu,
}: {
  crumb: string;
  onBack: () => void;
  saveState: "saving" | "saved" | "error" | null;
  onRetry?: () => void;
  onMenu?: () => void;
}) {
  return (
    <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={onBack} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="chevron-forward" size={22} color={t.ink} />
      </Pressable>
      <TText size={13} weight="medium" color={t.muted} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {crumb}
      </TText>
      {saveState === "saving" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 }}>
          <ActivityIndicator size="small" color={t.accent} style={{ transform: [{ scale: 0.6 }] }} />
          <TText size={12} weight="medium" color={t.muted}>
            جارٍ الحفظ…
          </TText>
        </View>
      ) : saveState === "saved" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6 }}>
          <Ionicons name="checkmark" size={14} color={t.saved} />
          <TText size={12} weight="semibold" color={t.saved}>
            حُفظ
          </TText>
        </View>
      ) : saveState === "error" ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: t.dangerSoft, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9 }}>
          <Ionicons name="refresh" size={13} color={t.dangerInk} />
          <TText size={12} weight="semibold" color={t.dangerInk}>
            تعذّر الحفظ · إعادة
          </TText>
        </Pressable>
      ) : null}
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel="خيارات المهمة" onPress={onMenu} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={t.ink} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );
}

/** The prototype's read-only layout: title and description as text, then labelled rows. */
function ReadOnlyDetails({
  title,
  description,
  mentionNames,
  boardsLine,
  statusLabel,
  statusPill,
  statusDot,
  onStatus,
  assignees,
  meId,
  due,
  priority,
  recurrence,
  cost,
  onExpand,
}: {
  title: string;
  description: string;
  mentionNames: readonly string[];
  boardsLine: string;
  statusLabel: string;
  statusPill: PillColors;
  statusDot: string;
  onStatus?: () => void;
  assignees: BoardMember[];
  meId: string | undefined;
  due: { text: string; tone: "overdue" | "upcoming" } | null;
  priority: { label: string; color: string } | null;
  recurrence: string | null;
  cost: string | null;
  onExpand: () => void;
}) {
  return (
    <>
      <View style={{ gap: 8, paddingTop: 6, paddingHorizontal: 4, paddingBottom: 4 }}>
        <TText size={13} color={t.muted}>
          {boardsLine}
        </TText>
        <TText size={22} weight="bold" lineHeight={32}>
          {title}
        </TText>
        {description.trim() ? (
          <Pressable accessibilityHint="اضغط مطولًا لعرض الوصف بكامل الشاشة" onLongPress={onExpand} delayLongPress={300}>
            <RichTextView look="task" text={description} mentionNames={mentionNames} fontSize={15} lineHeight={29} color={t.ink2} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: t.line }}>
        <LabelRow label="الحالة" minHeight={52}>
          <TPill label={statusLabel} colors={statusPill} dot={statusDot} chevron={!!onStatus} onPress={onStatus} />
        </LabelRow>
        <LabelRow label="المسؤولون">
          <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 }}>
            {assignees.length === 0 ? (
              <TText size={14} color={t.muted}>
                لا أحد
              </TText>
            ) : (
              assignees.map((m) => (
                <View key={m.userId} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <TAvatar person={m} size={26} />
                  <TText size={14} weight="medium">
                    {m.userId === meId ? "أنت" : m.user.firstName || m.user.displayName}
                  </TText>
                </View>
              ))
            )}
          </View>
        </LabelRow>
        {due ? (
          <LabelRow label="الموعد">
            <Ionicons name="time-outline" size={15} color={due.tone === "overdue" ? t.overdue : t.ink} />
            <TText size={14} weight="medium" color={due.tone === "overdue" ? t.overdue : t.ink}>
              {due.text}
            </TText>
          </LabelRow>
        ) : null}
        {priority ? (
          <LabelRow label="الأولوية">
            <Ionicons name="flag" size={14} color={priority.color} />
            <TText size={14} weight="medium">
              {priority.label}
            </TText>
          </LabelRow>
        ) : null}
        {recurrence ? (
          <LabelRow label="التكرار">
            <TText size={14} weight="medium">
              {recurrence}
            </TText>
          </LabelRow>
        ) : null}
        {cost ? (
          <LabelRow label="التكلفة">
            <TText size={14} weight="medium">
              {cost}
            </TText>
          </LabelRow>
        ) : null}
      </View>
    </>
  );
}

function LabelRow({ label, children, minHeight = 48 }: { label: string; children: ReactNode; minHeight?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <TText size={13} color={t.muted} style={{ width: 84 }}>
        {label}
      </TText>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 7 }}>{children}</View>
    </View>
  );
}

/** First paint while the task loads — the screen's own shapes, greyed. */
function LoadingSkeleton() {
  const bar = (width: number | `${number}%`, height: number, radius = 6) => <View style={{ width, height, borderRadius: radius, backgroundColor: t.chip }} />;
  return (
    <View style={{ flex: 1, backgroundColor: t.canvas, paddingTop: 16, paddingHorizontal: GUTTER, gap: 10 }}>
      <TCard style={{ minHeight: 58, paddingHorizontal: 14, justifyContent: "center" }}>{bar("62%", 16)}</TCard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {bar(14, 10)}
        {bar(150, 30, 8)}
        {bar(60, 30, 8)}
      </View>
      <TCard style={{ minHeight: 116, padding: 16, gap: 12 }}>
        {bar("94%", 10)}
        {bar("86%", 10)}
        {bar("48%", 10)}
      </TCard>
      <TCard style={{ minHeight: 56, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
        {bar(30, 30, 9)}
        {bar(76, 32, 999)}
        {bar(70, 32, 999)}
      </TCard>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {bar(92, 34, 10)}
        {bar(78, 34, 10)}
        {bar(108, 34, 10)}
      </View>
    </View>
  );
}
