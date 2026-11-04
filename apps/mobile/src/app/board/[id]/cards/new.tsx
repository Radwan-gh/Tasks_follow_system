import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { CardPriority, RecurrenceRule } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { PrioritySheet } from "@/components/priority-control";
import { RecurrenceSheet, summarizeRecurrence } from "@/components/recurrence-sheet";
import { RichTextView, SheetAction } from "@/components/rich-text-view";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/skeleton";
import { ErrorState } from "@/components/state-views";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { MoveCardSheet } from "@/features/boards/move-card-sheet";
import { DescriptionEditor } from "@/features/cards/description-editor";
import { MembersSheet } from "@/features/cards/members-sheet";
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
} from "@/features/cards/task-fields";
import { api } from "@/lib/api";
import { OVERSIZE_MESSAGE, pickAttachment, type PickedFile } from "@/lib/pick-attachment";
import { MIN_TOUCH_TARGET, colors, fonts, radii, spacing } from "@/theme/tokens";

type OptionalField = "due" | "recurrence" | "priority" | "subtasks" | "attachments" | "access";

/**
 * `/board/:id/cards/new?listId=&title=` — 6a «إضافة مهمة» in
 * `Tasks Mobile Redesign.dc.html`: the same rows, icons and places as the
 * edit screen (`card/[id].tsx`), so learning one teaches the other.
 *
 * The title is the one thing it needs; status and board come from where it
 * was opened and the assignee is «أنت» by default. Everything optional waits
 * as a dashed chip under the rows — tapping one turns it into a row — and one
 * «إضافة المهمة» sits fixed at the bottom (⏎ on the title adds too).
 *
 * Submission is sequential (`POST cards` → assignees → access → subtasks →
 * attachments) per `v2-new-style.md` §6; refs remember how far it got, so a
 * retry after a failed step resumes instead of creating the card twice.
 */
export default function NewCardScreen() {
  const { id: boardId, listId: initialListId, title: prefillTitle } = useLocalSearchParams<{
    id: string;
    listId: string;
    title?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const board = useQuery({ queryKey: ["board", boardId], queryFn: () => api.boards.get(boardId) });

  const [title, setTitle] = useState(prefillTitle ?? "");
  const [description, setDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [listId, setListId] = useState(initialListId);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<CardPriority>("NORMAL");
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  // `null` until the board is known: then «أنت», if you can be assigned here.
  const [assigneeIds, setAssigneeIds] = useState<string[] | null>(null);
  const [restrictedMemberIds, setRestrictedMemberIds] = useState<string[]>([]);
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  /** Optional fields turned from a chip into a row, in the order they were opened. */
  const [opened, setOpened] = useState<OptionalField[]>([]);

  const [sheet, setSheet] = useState<
    "status" | "assignees" | "due" | "priority" | "recurrence" | "access" | "attach" | null
  >(null);

  const [submitting, setSubmitting] = useState(false);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const cardIdRef = useRef<string | null>(null);
  const doneSubtasksRef = useRef(0);
  const doneFilesRef = useRef(0);
  const subtaskInputRef = useRef<TextInput>(null);

  const assignableMembers = useMemo(() => board.data?.members.filter((m) => m.role !== "VIEWER") ?? [], [board.data]);
  const assignees = assigneeIds ?? (user && assignableMembers.some((m) => m.userId === user.id) ? [user.id] : []);

  const canSubmit = title.trim().length > 0 && !submitting;

  function open(field: OptionalField) {
    setOpened((prev) => (prev.includes(field) ? prev : [...prev, field]));
    if (field === "due") setSheet("due");
    if (field === "priority") setSheet("priority");
    if (field === "recurrence") setSheet("recurrence");
    if (field === "access") setSheet("access");
    if (field === "attachments") setSheet("attach");
    if (field === "subtasks") setTimeout(() => subtaskInputRef.current?.focus(), 50);
  }

  function close(field: OptionalField) {
    setOpened((prev) => prev.filter((f) => f !== field));
    if (field === "due") {
      setDueDate(null);
      setRecurrence(null);
      setOpened((prev) => prev.filter((f) => f !== "recurrence"));
    }
    if (field === "priority") setPriority("NORMAL");
    if (field === "recurrence") setRecurrence(null);
    if (field === "subtasks") setSubtaskTitles([]);
    if (field === "attachments") setFiles([]);
    if (field === "access") setRestrictedMemberIds([]);
  }

  async function attach(source: "camera" | "library" | "file") {
    setSheet(null);
    const picked = await pickAttachment(source);
    if (picked === "oversize") setFileError(OVERSIZE_MESSAGE);
    else if (picked) {
      setFileError(null);
      setFiles((prev) => [...prev, picked].slice(0, 10));
    }
  }

  function addSubtask() {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtaskTitles((prev) => [...prev, t]);
    setNewSubtaskTitle("");
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setFailedStep(null);
    // A subtask typed but not yet ⏎'d is still meant to be added.
    const pendingSubtask = newSubtaskTitle.trim();
    const subtasks = pendingSubtask ? [...subtaskTitles, pendingSubtask] : subtaskTitles;
    if (pendingSubtask) {
      setSubtaskTitles(subtasks);
      setNewSubtaskTitle("");
    }
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
      const cardId = cardIdRef.current;

      if (assignees.length > 0) {
        step = "إسناد المسؤولين";
        await api.cards.updateAssignees(cardId, { userIds: assignees });
      }

      if (opened.includes("access")) {
        step = "تقييد الوصول";
        await api.cards.updateAccess(cardId, { isRestricted: true, memberUserIds: restrictedMemberIds });
      }

      step = "إضافة المهام الفرعية";
      for (; doneSubtasksRef.current < subtasks.length; doneSubtasksRef.current++) {
        await api.subtasks.create(cardId, { title: subtasks[doneSubtasksRef.current]! });
      }

      step = "رفع المرفقات";
      for (; doneFilesRef.current < files.length; doneFilesRef.current++) {
        const file = files[doneFilesRef.current]!;
        await api.attachments.upload(cardId, { name: file.name, type: file.type, bytes: () => new File(file.uri).bytes() });
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
        <Skeleton height={180} radius={20} />
        <Skeleton height={54} radius={20} />
        <Skeleton height={54} radius={20} />
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

  const data = board.data;
  const list = data.lists.find((l) => l.id === listId);
  const accessMembers = data.members.filter((m) => m.userId !== data.ownerId && m.userId !== user?.id);
  const memberById = (id: string) => data.members.find((m) => m.userId === id);
  const canCloseCard = !!user && (data.ownerId === user.id || assignees.includes(user.id));
  const chips: { field: OptionalField; label: string; icon: (typeof FIELD_ICONS)[keyof typeof FIELD_ICONS] }[] = [
    { field: "due", label: "موعد", icon: FIELD_ICONS.due },
    { field: "priority", label: "أولوية", icon: FIELD_ICONS.priority },
    { field: "subtasks", label: "مهام فرعية", icon: FIELD_ICONS.subtasks },
    { field: "attachments", label: "مرفق", icon: FIELD_ICONS.attachments },
    { field: "access", label: "تقييد الوصول", icon: FIELD_ICONS.access },
  ];
  // Repeating needs a deadline to count from, so its chip waits for one.
  if (dueDate) chips.splice(1, 0, { field: "recurrence", label: "تكرار", icon: FIELD_ICONS.recurrence });

  const mentionNames = data.members.flatMap((m) => [m.user.displayName, m.user.firstName]).filter(Boolean);

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, paddingHorizontal: spacing.md }}>
        <HeaderIconButton icon="close" accessibilityLabel="إغلاق" onPress={() => router.back()} />
        <AppText weight="bold" style={{ flex: 1, textAlign: "center", fontSize: 15, lineHeight: 24 }}>
          مهمة جديدة
        </AppText>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
        <View style={{ paddingTop: 10, paddingHorizontal: spacing.xl, paddingBottom: 14, gap: 6 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            // The title is the one required field — start there, keyboard up.
            autoFocus={!prefillTitle}
            placeholder="عنوان المهمة"
            placeholderTextColor={colors.dashed}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
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
          <AppText size="caption" color={colors.muted} style={{ lineHeight: 18 }}>
            في {data.name}
          </AppText>
        </View>

        {failedStep ? (
          <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.alertSoft, borderRadius: radii.field, padding: spacing.md, gap: spacing.sm }}>
            <AppText size="small" color={colors.alert}>
              تعذّر إكمال الخطوة: {failedStep}. باقي البيانات محفوظة — أعد المحاولة للمتابعة.
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void submit()}
              style={{ alignSelf: "flex-start", minHeight: MIN_TOUCH_TARGET - 8, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radii.field, backgroundColor: colors.alert }}
            >
              <AppText size="small" weight="semibold" color={colors.surface}>
                إعادة المحاولة
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {/* The description, straight under the title; ⤢ opens the full-screen editor (6c). */}
        <View
          style={{
            marginHorizontal: spacing.lg,
            marginBottom: spacing.md,
            minHeight: 180,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: descriptionFocused ? colors.accent : colors.line,
            borderRadius: 20,
            paddingVertical: spacing.lg,
            paddingHorizontal: 18,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            {descriptionFocused || !description ? (
              <TextInput
                value={description}
                onChangeText={setDescription}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => setDescriptionFocused(false)}
                autoFocus={descriptionFocused}
                multiline
                scrollEnabled={false}
                placeholder="أضف وصفًا أو الصق رابطًا…"
                placeholderTextColor={colors.faint}
                accessibilityLabel="الوصف"
                style={{ minHeight: 146, fontFamily: fonts.regular, fontSize: 16, lineHeight: 31, color: colors.ink, textAlign: "right", textAlignVertical: "top", writingDirection: "rtl", padding: 0 }}
              />
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="تعديل الوصف" onPress={() => setDescriptionFocused(true)}>
                <RichTextView text={description} mentionNames={mentionNames} fontSize={16} lineHeight={31} onEditLink={() => setEditingDescription(true)} />
              </Pressable>
            )}
          </View>
          <ExpandButton onPress={() => setEditingDescription(true)} />
        </View>

        <View style={{ marginHorizontal: spacing.lg, gap: 10 }}>
          <FieldCard>
            <FieldRow icon={FIELD_ICONS.status} onPress={() => setSheet("status")} accessibilityLabel={`الحالة: ${list?.name ?? ""}. اضغط للتغيير`}>
              <StatusPill name={list?.name ?? "—"} category={list?.statusCategory} editable />
            </FieldRow>
          </FieldCard>

          <FieldCard>
            <FieldRow icon={FIELD_ICONS.assignees} onPress={() => setSheet("assignees")} accessibilityLabel="المسؤولون. اضغط للتغيير">
              {assignees.map((id) => {
                const member = memberById(id);
                return member ? <PersonPill key={id} member={member} isMe={id === user?.id} /> : null;
              })}
              <AddCircle />
            </FieldRow>
          </FieldCard>

          {opened.map((field) => {
            switch (field) {
              case "due":
                return (
                  <FieldCard key={field}>
                    <FieldRow icon={FIELD_ICONS.due} onPress={() => setSheet("due")} accessibilityLabel="الموعد. اضغط للتغيير">
                      {dueDate ? <DuePill iso={dueDate} /> : <ValuePill text="اختر يومًا" />}
                      <RowRemove label="الموعد" onPress={() => close("due")} />
                    </FieldRow>
                  </FieldCard>
                );
              case "recurrence":
                return (
                  <FieldCard key={field}>
                    <FieldRow icon={FIELD_ICONS.recurrence} onPress={() => setSheet("recurrence")} accessibilityLabel="التكرار. اضغط للتغيير">
                      <ValuePill text={recurrence ? `↻ ${summarizeRecurrence(recurrence)}` : "بدون تكرار"} />
                      <RowRemove label="التكرار" onPress={() => close("recurrence")} />
                    </FieldRow>
                  </FieldCard>
                );
              case "priority":
                return (
                  <FieldCard key={field}>
                    <FieldRow icon={FIELD_ICONS.priority} onPress={() => setSheet("priority")} accessibilityLabel="الأولوية. اضغط للتغيير">
                      <PriorityPill priority={priority} />
                      <RowRemove label="الأولوية" onPress={() => close("priority")} />
                    </FieldRow>
                  </FieldCard>
                );
              case "subtasks":
                return (
                  <FieldCard key={field}>
                    <FieldRow icon={FIELD_ICONS.subtasks} minHeight={50}>
                      <AppText size="small" weight="bold" style={{ lineHeight: 20 }}>
                        {subtaskTitles.length > 0 ? `0/${subtaskTitles.length}` : "مهام فرعية"}
                      </AppText>
                      <RowRemove label="المهام الفرعية" onPress={() => close("subtasks")} />
                    </FieldRow>
                    {subtaskTitles.map((t, index) => (
                      <View key={`${index}-${t}`} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 50, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                        <View style={{ width: 22, height: 22, marginHorizontal: 3, borderRadius: 7, borderWidth: 1.5, borderColor: colors.lineStrong }} />
                        <AppText style={{ flex: 1, fontSize: 14, lineHeight: 22 }}>{t}</AppText>
                        <Pressable accessibilityRole="button" accessibilityLabel={`حذف «${t}»`} hitSlop={8} onPress={() => setSubtaskTitles((prev) => prev.filter((_, i) => i !== index))}>
                          <Ionicons name="close" size={16} color={colors.faint} />
                        </Pressable>
                      </View>
                    ))}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                      <View style={{ width: 28, alignItems: "center" }}>
                        <AppText color={colors.accent} style={{ fontSize: 18, lineHeight: 24 }}>
                          +
                        </AppText>
                      </View>
                      <TextInput
                        ref={subtaskInputRef}
                        value={newSubtaskTitle}
                        onChangeText={setNewSubtaskTitle}
                        placeholder="أضف مهمة فرعية ثم ⏎"
                        placeholderTextColor={colors.faint}
                        onSubmitEditing={addSubtask}
                        multiline
                        submitBehavior="submit"
                        returnKeyType="done"
                        style={{ flex: 1, minHeight: 50, fontFamily: fonts.regular, fontSize: 14, color: colors.ink, textAlign: "right", writingDirection: "rtl" }}
                      />
                    </View>
                  </FieldCard>
                );
              case "attachments":
                return (
                  <FieldCard key={field}>
                    <FieldRow icon={FIELD_ICONS.attachments} onPress={() => setSheet("attach")} accessibilityLabel="المرفقات. اضغط لإضافة ملف">
                      {files.map((file, index) => (
                        <Pressable
                          key={`${index}-${file.uri}`}
                          accessibilityRole="button"
                          accessibilityLabel={`إزالة ${file.name}`}
                          onPress={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                          style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 180, backgroundColor: colors.chip, borderRadius: radii.chip, paddingVertical: 6, paddingHorizontal: spacing.md }}
                        >
                          <AppText size="small" numberOfLines={1} style={{ flexShrink: 1, lineHeight: 18 }}>
                            {file.name}
                          </AppText>
                          <Ionicons name="close" size={14} color={colors.faint} />
                        </Pressable>
                      ))}
                      {files.length < 10 ? <AddCircle /> : null}
                      <RowRemove label="المرفقات" onPress={() => close("attachments")} />
                    </FieldRow>
                    {fileError ? (
                      <AppText size="caption" color={colors.alert} style={{ paddingHorizontal: 14, paddingBottom: spacing.sm }}>
                        {fileError}
                      </AppText>
                    ) : null}
                  </FieldCard>
                );
              case "access":
                return (
                  <FieldCard key={field}>
                    <FieldRow icon={FIELD_ICONS.access} onPress={() => setSheet("access")} accessibilityLabel="من يرى المهمة. اضغط للتغيير">
                      {restrictedMemberIds.length === 0 ? (
                        <ValuePill text="أنت ومالك اللوحة فقط" />
                      ) : (
                        restrictedMemberIds.map((id) => {
                          const member = memberById(id);
                          return member ? <PersonPill key={id} member={member} isMe={false} /> : null;
                        })
                      )}
                      <AddCircle />
                      <RowRemove label="تقييد الوصول" onPress={() => close("access")} />
                    </FieldRow>
                  </FieldCard>
                );
            }
          })}
        </View>

        {chips.some((c) => !opened.includes(c.field)) ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingTop: spacing.lg, paddingHorizontal: spacing.lg }}>
            {chips
              .filter((c) => !opened.includes(c.field))
              .map((c) => (
                <OptionalChip key={c.field} icon={c.icon} label={c.label} onPress={() => open(c.field)} />
              ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ paddingTop: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.line, alignItems: "center", gap: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={() => void submit()}
          style={{ alignSelf: "stretch", minHeight: 52, borderRadius: radii.field, backgroundColor: canSubmit || submitting ? colors.accent : colors.dashed, alignItems: "center", justifyContent: "center" }}
        >
          <AppText weight="bold" color={colors.surface} style={{ fontSize: 16 }}>
            {submitting ? "جارٍ الإضافة…" : failedStep ? "متابعة الإضافة" : "إضافة المهمة"}
          </AppText>
        </Pressable>
        <AppText color={colors.faint} style={{ fontSize: 11, lineHeight: 16 }}>
          العنوان وحده يكفي · ⏎ من لوحة المفاتيح يضيف أيضًا
        </AppText>
      </View>

      <DescriptionEditor
        visible={editingDescription}
        taskTitle={title.trim() || "مهمة جديدة"}
        initialText={description}
        members={assignableMembers}
        onDone={(text) => {
          setDescription(text);
          setEditingDescription(false);
        }}
        onCancel={() => setEditingDescription(false)}
      />

      <MoveCardSheet
        visible={sheet === "status"}
        onClose={() => setSheet(null)}
        card={{ listId }}
        lists={data.lists}
        nextListId={null}
        canCloseCard={canCloseCard}
        onMove={(target) => {
          setListId(target);
          setSheet(null);
        }}
      />

      <MembersSheet
        visible={sheet === "assignees"}
        onClose={() => setSheet(null)}
        title="المسؤولون"
        members={assignableMembers}
        lookup={data.members}
        selectedIds={assignees}
        onChange={setAssigneeIds}
        meId={user?.id}
      />

      <MembersSheet
        visible={sheet === "access"}
        onClose={() => setSheet(null)}
        title="من يرى المهمة"
        members={accessMembers}
        lookup={data.members}
        selectedIds={restrictedMemberIds}
        onChange={setRestrictedMemberIds}
        meId={user?.id}
        note="أنت ومالك اللوحة ترونها دائمًا."
      />

      <DueDateSheet visible={sheet === "due"} onClose={() => setSheet(null)} onChange={setDueDate} value={dueDate} />

      <PrioritySheet
        visible={sheet === "priority"}
        onClose={() => setSheet(null)}
        value={priority}
        onChange={(next) => {
          setPriority(next);
          setSheet(null);
        }}
        saving={false}
        failed={false}
      />

      <RecurrenceSheet visible={sheet === "recurrence"} onClose={() => setSheet(null)} value={recurrence} onChange={setRecurrence} />

      <BottomSheet visible={sheet === "attach"} onClose={() => setSheet(null)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <SheetAction label="الكاميرا" onPress={() => void attach("camera")} />
          <SheetAction label="المعرض" onPress={() => void attach("library")} />
          <SheetAction label="ملف" onPress={() => void attach("file")} />
          <AppText size="caption" color={colors.muted}>
            أي نوع ملف · حتى 10 · 30MB للملف — تُرفع بعد إضافة المهمة.
          </AppText>
        </View>
      </BottomSheet>
    </Screen>
  );
}
