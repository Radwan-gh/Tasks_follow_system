import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardMember, Subtask } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { SheetAction } from "@/components/rich-text-view";
import { AppText } from "@/components/text";
import { api } from "@/lib/api";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { useAuth } from "@/features/auth/auth-context";
import { MembersSheet } from "./members-sheet";
import { FIELD_ICONS, FieldCard, MemberAvatar } from "./task-fields";
import { colors, fonts, radii, spacing } from "@/theme/tokens";

/** Stable "nobody" for `useAutoSavedIds` while no subtask's people field is open. */
const NO_IDS: string[] = [];

/** Never sent to the server — replaced by the real id once the create request resolves. */
function makeTempId(): string {
  return `temp:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toggleSubtaskDone(list: Subtask[], id: string): Subtask[] {
  return list.map((s) => (s.id === id ? { ...s, isDone: !s.isDone } : s));
}

function removeSubtaskFromList(list: Subtask[], id: string): Subtask[] {
  return list.filter((s) => s.id !== id);
}

function addSubtaskToList(list: Subtask[], subtask: Subtask): Subtask[] {
  return [...list, subtask];
}

function makeTempSubtask(input: { id: string; cardId: string; title: string; createdById: string }): Subtask {
  return {
    id: input.id,
    cardId: input.cardId,
    title: input.title,
    isDone: false,
    position: "",
    createdById: input.createdById,
    assigneeIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The subtasks group on the task screen (6b): a header row — ☑, «3/5», the
 * progress bar, «+» — and one row per item: tick box, title, its person.
 * Every member may tick; only the task's owner adds (the «+» or ⏎), assigns
 * (the avatar, which opens `MembersSheet`) and deletes (long press).
 */
export function SubtasksSection({
  cardId,
  boardMembers,
  readOnly = false,
  canEdit = !readOnly,
  addRequest = 0,
}: {
  cardId: string;
  boardMembers: BoardMember[];
  /** Can't even tick items off (viewer, archived board, oversight). */
  readOnly?: boolean;
  /** May add, assign and delete items — only the task's owner (board owner or creator). */
  canEdit?: boolean;
  /** Bumped by the screen's «مهام فرعية» chip: opens and focuses the add field. */
  addRequest?: number;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [newTitle, setNewTitle] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const subtasksKey = ["subtasks", cardId] as const;
  const subtasks = useQuery({ queryKey: subtasksKey, queryFn: () => api.subtasks.list(cardId) });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: subtasksKey });
  }

  const create = useMutation({
    mutationFn: (title: string) => api.subtasks.create(cardId, { title }),
    onMutate: async (title) => {
      setNewTitle("");
      await queryClient.cancelQueries({ queryKey: subtasksKey });
      const previous = queryClient.getQueryData<Subtask[]>(subtasksKey);
      if (previous) {
        const temp = makeTempSubtask({ id: makeTempId(), cardId, title, createdById: user?.id ?? "" });
        queryClient.setQueryData(subtasksKey, addSubtaskToList(previous, temp));
      }
      return { previous };
    },
    onError: (_err, _title, context) => {
      if (context?.previous) queryClient.setQueryData(subtasksKey, context.previous);
    },
    onSettled: invalidate,
  });

  const toggleDone = useMutation({
    mutationFn: (subtask: Subtask) => api.subtasks.update(subtask.id, { isDone: !subtask.isDone }),
    onMutate: async (subtask) => {
      await queryClient.cancelQueries({ queryKey: subtasksKey });
      const previous = queryClient.getQueryData<Subtask[]>(subtasksKey);
      if (previous) queryClient.setQueryData(subtasksKey, toggleSubtaskDone(previous, subtask.id));
      return { previous };
    },
    onError: (_err, _subtask, context) => {
      if (context?.previous) queryClient.setQueryData(subtasksKey, context.previous);
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.subtasks.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: subtasksKey });
      const previous = queryClient.getQueryData<Subtask[]>(subtasksKey);
      if (previous) queryClient.setQueryData(subtasksKey, removeSubtaskFromList(previous, id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(subtasksKey, context.previous);
    },
    onSettled: invalidate,
  });

  const list = subtasks.data ?? [];
  const doneCount = list.filter((s) => s.isDone).length;
  const assigningSubtask = list.find((s) => s.id === assigningId) ?? null;
  const [menuFor, setMenuFor] = useState<Subtask | null>(null);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<TextInput>(null);

  // The «مهام فرعية» chip (or the header's «+») asks for the add field.
  useEffect(() => {
    if (addRequest > 0) {
      setAdding(true);
      setTimeout(() => addRef.current?.focus(), 50);
    }
  }, [addRequest]);

  // Saves on every tick in the sheet.
  const assigneeSelection = useAutoSavedIds(assigningSubtask?.assigneeIds ?? NO_IDS, async (userIds) => {
    if (!assigningId) return;
    await api.subtasks.updateAssignees(assigningId, { userIds });
    invalidate();
  });

  const showAdd = canEdit && (adding || list.length === 0);

  return (
    <FieldCard>
      {/* 6b: ☑ · 3/5 · progress · + */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 50, paddingVertical: 4, paddingHorizontal: 14 }}>
        <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={FIELD_ICONS.subtasks} size={18} color={colors.muted} />
        </View>
        <AppText size="small" weight="bold" style={{ lineHeight: 20 }}>
          {list.length > 0 ? `${doneCount}/${list.length}` : "مهام فرعية"}
        </AppText>
        <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.hairline, overflow: "hidden" }}>
          {list.length > 0 ? (
            <View style={{ height: "100%", width: `${(doneCount / list.length) * 100}%`, backgroundColor: colors.done }} />
          ) : null}
        </View>
        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إضافة مهمة فرعية"
            onPress={() => {
              setAdding(true);
              addRef.current?.focus();
            }}
            style={{ width: 36, height: 36, borderRadius: radii.iconButton, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" }}
          >
            <AppText color={colors.subtle} style={{ fontSize: 18, lineHeight: 24 }}>
              +
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {list.map((subtask) => {
        const assignee = subtask.assigneeIds.map((id) => boardMembers.find((m) => m.userId === id)).find((m): m is BoardMember => !!m);
        // A subtask still being created has no server id to act on yet.
        const pending = subtask.id.startsWith("temp:");
        return (
          <Pressable
            key={subtask.id}
            onLongPress={canEdit && !pending ? () => setMenuFor(subtask) : undefined}
            accessibilityHint={canEdit ? "اضغط مطولًا للحذف" : undefined}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 50, paddingVertical: 4, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.hairline }}
          >
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: subtask.isDone }}
              accessibilityLabel={subtask.title}
              disabled={readOnly}
              onPress={() => toggleDone.mutate(subtask)}
              hitSlop={11}
              style={{
                width: 22,
                height: 22,
                marginHorizontal: 3,
                borderRadius: 7,
                backgroundColor: subtask.isDone ? colors.done : "transparent",
                borderWidth: subtask.isDone ? 0 : 1.5,
                borderColor: colors.lineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {subtask.isDone ? (
                <AppText color={colors.surface} style={{ fontSize: 12, lineHeight: 16 }}>
                  ✓
                </AppText>
              ) : null}
            </Pressable>

            <AppText
              style={{ flex: 1, fontSize: 14, lineHeight: 22, textDecorationLine: subtask.isDone ? "line-through" : "none" }}
              color={subtask.isDone ? colors.faint : colors.ink}
            >
              {subtask.title}
            </AppText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`المسؤول عن «${subtask.title}»`}
              disabled={!canEdit || pending}
              onPress={() => setAssigningId(subtask.id)}
              hitSlop={9}
            >
              {assignee ? (
                <MemberAvatar member={assignee} />
              ) : canEdit ? (
                <View style={{ width: 26, height: 26, borderRadius: 999, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.dashedStrong }} />
              ) : null}
            </Pressable>
          </Pressable>
        );
      })}

      {showAdd ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: 14, borderTopWidth: list.length > 0 ? 1 : 0, borderTopColor: colors.hairline }}>
          <View style={{ width: 28, alignItems: "center" }}>
            <AppText color={colors.accent} style={{ fontSize: 18, lineHeight: 24 }}>
              +
            </AppText>
          </View>
          <TextInput
            ref={addRef}
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="أضف مهمة فرعية ثم ⏎"
            placeholderTextColor={colors.faint}
            onSubmitEditing={() => newTitle.trim() && create.mutate(newTitle.trim())}
            onBlur={() => {
              if (!newTitle.trim()) setAdding(false);
            }}
            // `multiline` (with Enter still submitting) because a single-line,
            // right-aligned Android input always reports it can scroll sideways,
            // so a drag that starts on it never reaches the page's ScrollView.
            multiline
            submitBehavior="submit"
            returnKeyType="done"
            style={{
              flex: 1,
              minHeight: 50,
              fontFamily: fonts.regular,
              fontSize: 14,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        </View>
      ) : null}

      <MembersSheet
        visible={!!assigningSubtask}
        onClose={() => setAssigningId(null)}
        title={assigningSubtask ? `المسؤول عن «${assigningSubtask.title}»` : ""}
        members={boardMembers}
        selectedIds={assigneeSelection.ids}
        onChange={assigneeSelection.change}
        meId={user?.id}
        saving={assigneeSelection.saving}
        failed={assigneeSelection.failed}
      />

      <BottomSheet visible={!!menuFor} onClose={() => setMenuFor(null)}>
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          <AppText size="small" color={colors.muted} numberOfLines={1}>
            {menuFor?.title ?? ""}
          </AppText>
          <SheetAction
            label="حذف المهمة الفرعية"
            destructive
            onPress={() => {
              if (menuFor) remove.mutate(menuFor.id);
              setMenuFor(null);
            }}
          />
        </View>
      </BottomSheet>
    </FieldCard>
  );
}
