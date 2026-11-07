import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardMember, Subtask } from "@app/types";
import { useAuth } from "@/features/auth/auth-context";
import { api } from "@/lib/api";
import { useAutoSavedIds } from "@/lib/use-auto-saved-ids";
import { t, taskFonts } from "@/theme/task-tokens";
import { fs } from "@/theme/tokens";
import { PeopleSheet } from "./task-people";
import { CloseButton, SectionHeader, TAvatar, TCard, TDialog, TText } from "./task-ui";

const NO_IDS: string[] = [];

export const subtasksKey = (cardId: string) => ["subtasks", cardId] as const;

function makeTemp(cardId: string, title: string, createdById: string): Subtask {
  const now = new Date().toISOString();
  return {
    id: `temp:${Date.now()}-${Math.random().toString(36).slice(2)}`,
    cardId,
    title,
    isDone: false,
    position: "",
    createdById,
    assigneeIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * «مهام فرعية» (`Edit Task Prototype.dc.html`): header with the done count
 * and ✕, a thin progress bar, a row per item — tick box, title, ✕ — and
 * «أضف مهمة فرعية ثم ⏎» with «إضافة». Every member may tick; the task's owner
 * adds, deletes and assigns (the avatar, an addition to the prototype — the
 * app has subtask assignees). Closing the section deletes its items, so with
 * items in it the ✕ asks first.
 */
export function TaskSubtasks({
  cardId,
  members,
  readOnly,
  canEdit,
  focusRequest,
  onCloseSection,
  onMutating,
  onFailed,
}: {
  cardId: string;
  members: BoardMember[];
  readOnly: boolean;
  canEdit: boolean;
  /** Bumped when the section is opened from its chip — focuses the add field. */
  focusRequest: number;
  onCloseSection: () => void;
  onMutating: (busy: boolean) => void;
  onFailed: (retry: () => void) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = subtasksKey(cardId);
  const subtasks = useQuery({ queryKey: key, queryFn: () => api.subtasks.list(cardId) });
  const [draft, setDraft] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (focusRequest > 0) setTimeout(() => inputRef.current?.focus(), 80);
  }, [focusRequest]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["cardHistory", cardId] });
  }

  function optimistic(update: (list: Subtask[]) => Subtask[]) {
    return async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Subtask[]>(key);
      if (previous) queryClient.setQueryData(key, update(previous));
      return { previous };
    };
  }

  const create = useMutation({
    mutationFn: (title: string) => api.subtasks.create(cardId, { title }),
    onMutate: (title) => optimistic((list) => [...list, makeTemp(cardId, title, user?.id ?? "")])(),
    onError: (_e, title, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      onFailed(() => create.mutate(title));
    },
    onSettled: invalidate,
  });

  const toggle = useMutation({
    mutationFn: (s: Subtask) => api.subtasks.update(s.id, { isDone: !s.isDone }),
    onMutate: (s) => optimistic((list) => list.map((x) => (x.id === s.id ? { ...x, isDone: !x.isDone } : x)))(),
    onError: (_e, s, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      onFailed(() => toggle.mutate(s));
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.subtasks.remove(id),
    onMutate: (id) => optimistic((list) => list.filter((x) => x.id !== id))(),
    onError: (_e, id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      onFailed(() => remove.mutate(id));
    },
    onSettled: invalidate,
  });

  const removeAll = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.subtasks.remove(id);
    },
    onSuccess: () => {
      setConfirmingClose(false);
      onCloseSection();
    },
    onError: (_e, ids) => onFailed(() => removeAll.mutate(ids)),
    onSettled: invalidate,
  });

  const busy = create.isPending || toggle.isPending || remove.isPending || removeAll.isPending;
  useEffect(() => onMutating(busy), [busy, onMutating]);

  const list = subtasks.data ?? [];
  const done = list.filter((s) => s.isDone).length;
  const assigning = list.find((s) => s.id === assigningId) ?? null;
  const assignSelection = useAutoSavedIds(assigning?.assigneeIds ?? NO_IDS, async (userIds) => {
    if (!assigningId) return;
    await api.subtasks.updateAssignees(assigningId, { userIds });
    invalidate();
  });

  function add() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    create.mutate(title);
  }

  return (
    <TCard style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 6 }}>
      <SectionHeader
        icon="checkbox-outline"
        title="مهام فرعية"
        end={
          list.length > 0 ? (
            <TText size={12} weight="semibold" color={t.ink3}>
              {done}/{list.length}
            </TText>
          ) : undefined
        }
        onClose={canEdit ? () => (list.length > 0 ? setConfirmingClose(true) : onCloseSection()) : undefined}
        closeLabel="إغلاق المهام الفرعية"
      />
      <View style={{ height: 4, borderRadius: 999, backgroundColor: t.hairline, marginTop: 8, marginBottom: 6, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${list.length ? Math.round((done / list.length) * 100) : 0}%`, backgroundColor: t.done, borderRadius: 999 }} />
      </View>

      {list.map((subtask) => {
        const pending = subtask.id.startsWith("temp:");
        const assignee = subtask.assigneeIds.map((id) => members.find((m) => m.userId === id)).find((m): m is BoardMember => !!m);
        return (
          <View key={subtask.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, borderTopWidth: 1, borderTopColor: t.hairline }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: subtask.isDone, disabled: readOnly }}
              accessibilityLabel={subtask.title}
              disabled={readOnly || pending}
              hitSlop={12}
              onPress={() => toggle.mutate(subtask)}
              style={{
                width: 20,
                height: 20,
                marginHorizontal: 2,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: subtask.isDone ? t.done : t.dim,
                backgroundColor: subtask.isDone ? t.done : t.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {subtask.isDone ? <Ionicons name="checkmark" size={13} color={t.surface} /> : null}
            </Pressable>
            <TText size={14} color={subtask.isDone ? t.doneText : t.ink} style={{ flex: 1 }}>
              {subtask.title}
            </TText>
            {assignee || canEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`المسؤول عن «${subtask.title}»`}
                disabled={!canEdit || pending}
                hitSlop={8}
                onPress={() => setAssigningId(subtask.id)}
              >
                {assignee ? (
                  <TAvatar person={assignee} size={22} />
                ) : (
                  <View style={{ width: 22, height: 22, borderRadius: 999, borderWidth: 1, borderStyle: "dashed", borderColor: t.idle, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="person-outline" size={11} color={t.faint} />
                  </View>
                )}
              </Pressable>
            ) : null}
            {canEdit ? <CloseButton filled={false} onPress={() => remove.mutate(subtask.id)} accessibilityLabel={`حذف «${subtask.title}»`} /> : null}
          </View>
        );
      })}

      {canEdit ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, borderTopWidth: 1, borderTopColor: t.hairline }}>
          <View style={{ width: 20, marginHorizontal: 2, alignItems: "center" }}>
            <Ionicons name="add" size={18} color={t.accent} />
          </View>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="أضف مهمة فرعية ثم ⏎"
            placeholderTextColor={t.faint}
            onSubmitEditing={add}
            submitBehavior="submit"
            returnKeyType="done"
            // Multiline so a drag that starts here still scrolls the page (single-line RTL inputs swallow it on Android).
            multiline
            style={{ flex: 1, minHeight: 44, padding: 0, fontFamily: taskFonts.regular, fontSize: fs(14), color: t.ink, textAlign: "right", writingDirection: "rtl", textAlignVertical: "center" }}
          />
          <Pressable accessibilityRole="button" onPress={add} hitSlop={6} style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
            <TText size={13} weight="semibold" color={t.accent}>
              إضافة
            </TText>
          </Pressable>
        </View>
      ) : null}

      <PeopleSheet
        visible={!!assigning}
        onClose={() => setAssigningId(null)}
        title={assigning ? `المسؤول عن «${assigning.title}»` : ""}
        members={members}
        selectedIds={assignSelection.ids}
        onChange={assignSelection.change}
        meId={user?.id}
      />

      <TDialog visible={confirmingClose} onClose={() => setConfirmingClose(false)}>
        <TText size={18} weight="bold">
          حذف المهام الفرعية؟
        </TText>
        <TText size={14} color={t.ink3} lineHeight={24}>
          إغلاق القسم يحذف {list.length === 1 ? "المهمة الفرعية" : `${list.length} مهام فرعية`} من هذه المهمة.
        </TText>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => setConfirmingClose(false)} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.canvas, alignItems: "center", justifyContent: "center" }}>
            <TText size={15} weight="semibold">
              إلغاء
            </TText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={removeAll.isPending}
            onPress={() => removeAll.mutate(list.filter((s) => !s.id.startsWith("temp:")).map((s) => s.id))}
            style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" }}
          >
            <TText size={15} weight="semibold" color={t.surface}>
              {removeAll.isPending ? "جارٍ الحذف…" : "حذف"}
            </TText>
          </Pressable>
        </View>
      </TDialog>
    </TCard>
  );
}
