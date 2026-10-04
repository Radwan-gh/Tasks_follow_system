import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CardPriority, RecurrenceRule } from "@app/types";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { PeopleField } from "@/features/cards/people-field";
import { DueDateSheet } from "@/components/due-date-sheet";
import { PrioritySegmented } from "@/components/priority-control";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { formatDueDate } from "@/lib/date";
import { api } from "@/lib/api";
import { RevealScrollView } from "@/lib/scroll-reveal";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * `/board/:id/cards/new?listId=&title=` — the design's "إضافة مهمة جديدة".
 * This is the *opt-in* path now: the board screen creates title-only cards
 * inline, and «تفاصيل» opens this screen (carrying whatever was typed in
 * `title`) for what only it offers — description, due date,
 * recurrence, priority, assignees, subtasks, restricted access. The target
 * list is fixed by the caller, so there is no board/status picker here.
 * Submission is sequential (`POST cards` → `updateAssignees` → `updateAccess`
 * → `POST subtasks` per subtask) per `v2-new-style.md` §6 — a
 * `cardIdRef`/`doneSubtasksRef` pair means retrying after a failed step
 * resumes instead of re-creating the card or duplicating subtasks.
 */
export default function NewCardScreen() {
  const { id: boardId, listId, title: prefillTitle } = useLocalSearchParams<{
    id: string;
    listId: string;
    title?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const board = useQuery({ queryKey: ["board", boardId], queryFn: () => api.boards.get(boardId) });

  const [title, setTitle] = useState(prefillTitle ?? "");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<CardPriority>("NORMAL");
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [restricted, setRestricted] = useState(false);
  const [restrictedMemberIds, setRestrictedMemberIds] = useState<string[]>([]);
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const [pickingDueDate, setPickingDueDate] = useState(false);
  const [pickingRecurrence, setPickingRecurrence] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const cardIdRef = useRef<string | null>(null);
  const doneSubtasksRef = useRef(0);

  const canSubmit = title.trim().length > 0 && !submitting;

  async function submit() {
    setSubmitting(true);
    setFailedStep(null);
    let step = "إنشاء المهمة";
    try {
      if (!cardIdRef.current) {
        const card = await api.cards.create(listId, {
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate,
          priority,
          recurrence,
        });
        cardIdRef.current = card.id;
      }

      if (assigneeIds.length > 0) {
        step = "إسناد المسؤولين";
        await api.cards.updateAssignees(cardIdRef.current, { userIds: assigneeIds });
      }

      if (restricted) {
        step = "تقييد الوصول";
        await api.cards.updateAccess(cardIdRef.current, { isRestricted: true, memberUserIds: restrictedMemberIds });
      }

      step = "إضافة المهام الفرعية";
      for (; doneSubtasksRef.current < subtaskTitles.length; doneSubtasksRef.current++) {
        await api.subtasks.create(cardIdRef.current, { title: subtaskTitles[doneSubtasksRef.current]! });
      }

      void queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      router.back();
    } catch {
      setFailedStep(step);
    } finally {
      setSubmitting(false);
    }
  }

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

  const list = board.data.lists.find((l) => l.id === listId);
  const nonImplicitMembers = board.data.members.filter((m) => m.userId !== board.data!.ownerId);
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
          <AppText size="title" color={colors.muted}>
            ✕
          </AppText>
        </Pressable>
        <AppText weight="bold">مهمة جديدة{list ? ` — ${list.name}` : ""}</AppText>
        <Pressable accessibilityRole="button" onPress={submit} disabled={!canSubmit} hitSlop={8}>
          <AppText weight="bold" color={canSubmit ? colors.accent : colors.muted}>
            {submitting ? "جارٍ الإضافة..." : "إضافة"}
          </AppText>
        </Pressable>
      </View>

      <RevealScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="عنوان المهمة"
          placeholderTextColor={colors.line}
          multiline
          style={{
            fontFamily: fonts.bold,
            fontSize: fontSizes.heading,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
            paddingBottom: spacing.sm,
          }}
        />

        {failedStep ? (
          <View style={{ backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md, gap: spacing.sm }}>
            <AppText size="small" color={colors.alert}>
              تعذّر إكمال الخطوة: {failedStep}. باقي البيانات محفوظة — أعد المحاولة للمتابعة.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={submit}
              style={{
                alignSelf: "flex-start",
                minHeight: MIN_TOUCH_TARGET - 8,
                justifyContent: "center",
                paddingHorizontal: spacing.lg,
                borderRadius: radii.field,
                backgroundColor: colors.alert,
              }}
            >
              <AppText size="small" weight="semibold" color={colors.surface}>
                إعادة المحاولة
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            الوصف
          </AppText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="وصف اختياري"
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
        </View>

        <Row
          label="موعد التسليم"
          value={dueDate ? formatDueDate(dueDate) : "بلا موعد"}
          onPress={() => setPickingDueDate(true)}
        />

        <Row
          label="التكرار"
          value={recurrence ? summarizeRecurrence(recurrence)! : "بدون"}
          onPress={() => setPickingRecurrence(true)}
        />

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            الأولوية
          </AppText>
          <PrioritySegmented value={priority} onChange={setPriority} />
        </View>

        <PeopleField
          label="المسؤولون"
          members={assignableMembers}
          lookup={board.data.members}
          selectedIds={assigneeIds}
          // The card doesn't exist yet — picks stay local and are sent by `submit`.
          onChange={setAssigneeIds}
          placeholder="اكتب اسمًا لإسناد المهمة"
          accessibilityLabel="أضف مسؤولًا عن المهمة"
          emptyHint="لا يوجد أعضاء في اللوحة لإسنادها إليهم."
        />

        <View style={{ gap: spacing.sm }}>
          <AppText size="caption" weight="semibold" color={colors.muted}>
            المهام الفرعية
          </AppText>
          {subtaskTitles.map((t, index) => (
            <View
              key={index}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: colors.canvas,
                borderRadius: radii.field,
                padding: spacing.md,
              }}
            >
              <AppText style={{ flex: 1 }}>{t}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="حذف"
                onPress={() => setSubtaskTitles((prev) => prev.filter((_, i) => i !== index))}
                hitSlop={8}
              >
                <AppText color={colors.alert}>✕</AppText>
              </Pressable>
            </View>
          ))}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors.line,
              borderRadius: radii.field,
              paddingHorizontal: spacing.md,
            }}
          >
            <TextInput
              value={newSubtaskTitle}
              onChangeText={setNewSubtaskTitle}
              placeholder="+ إضافة مهمة فرعية"
              placeholderTextColor={colors.muted}
              onSubmitEditing={() => {
                const t = newSubtaskTitle.trim();
                if (t) {
                  setSubtaskTitles((prev) => [...prev, t]);
                  setNewSubtaskTitle("");
                }
              }}
              returnKeyType="done"
              style={{
                flex: 1,
                minHeight: MIN_TOUCH_TARGET,
                fontFamily: fonts.regular,
                fontSize: fontSizes.body,
                color: colors.ink,
                textAlign: "right",
                writingDirection: "rtl",
              }}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: restricted }}
          onPress={() => setRestricted((v) => !v)}
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
          <View style={{ gap: spacing.sm }}>
            <PeopleField
              members={nonImplicitMembers}
              lookup={board.data.members}
              selectedIds={restrictedMemberIds}
              onChange={setRestrictedMemberIds}
              placeholder="اكتب اسم من يملك الوصول"
              accessibilityLabel="أضف شخصًا يملك الوصول"
              emptyHint="لا يوجد أعضاء آخرون في اللوحة."
            />
            <AppText size="caption" color={colors.muted}>
              مالك اللوحة يملك الوصول دائمًا.
            </AppText>
          </View>
        ) : null}
      </RevealScrollView>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} />

      <RecurrenceSheet
        visible={pickingRecurrence}
        onClose={() => setPickingRecurrence(false)}
        value={recurrence}
        onChange={setRecurrence}
      />
    </Screen>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
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
        {label}
      </AppText>
      <AppText size="small" weight="semibold">
        {value}
      </AppText>
    </Pressable>
  );
}
