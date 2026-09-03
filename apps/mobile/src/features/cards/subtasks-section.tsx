import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardMember, Subtask } from "@app/types";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { api } from "@/lib/api";
import { AssigneePickerSheet } from "./assignee-picker-sheet";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing, statusColors } from "@/theme/tokens";

export function SubtasksSection({
  cardId,
  boardMembers,
  readOnly = false,
}: {
  cardId: string;
  boardMembers: BoardMember[];
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const subtasks = useQuery({ queryKey: ["subtasks", cardId], queryFn: () => api.subtasks.list(cardId) });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["subtasks", cardId] });
  }

  const create = useMutation({
    mutationFn: (title: string) => api.subtasks.create(cardId, { title }),
    onSuccess: () => {
      setNewTitle("");
      invalidate();
    },
  });

  const toggleDone = useMutation({
    mutationFn: (subtask: Subtask) => api.subtasks.update(subtask.id, { isDone: !subtask.isDone }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.subtasks.remove(id),
    onSuccess: invalidate,
  });

  const updateAssignees = useMutation({
    mutationFn: (input: { id: string; userIds: string[] }) =>
      api.subtasks.updateAssignees(input.id, { userIds: input.userIds }),
    onSuccess: () => {
      setAssigningId(null);
      invalidate();
    },
  });

  const list = subtasks.data ?? [];
  const doneCount = list.filter((s) => s.isDone).length;
  const assigningSubtask = list.find((s) => s.id === assigningId) ?? null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <AppText size="caption" weight="semibold" color={colors.muted}>
          المهام الفرعية
        </AppText>
        {list.length > 0 ? (
          <AppText size="caption" color={colors.muted}>
            {doneCount}/{list.length}
          </AppText>
        ) : null}
      </View>

      {list.length > 0 ? (
        <View style={{ height: 6, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" }}>
          <View
            style={{
              height: "100%",
              width: `${(doneCount / list.length) * 100}%`,
              backgroundColor: statusColors.DONE,
            }}
          />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {list.map((subtask) => {
          const assignees = subtask.assigneeIds
            .map((id) => boardMembers.find((m) => m.userId === id))
            .filter((m): m is BoardMember => !!m);
          return (
            <View
              key={subtask.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                backgroundColor: subtask.isDone ? colors.canvas : colors.surface,
                borderWidth: subtask.isDone ? 0 : 1,
                borderColor: colors.line,
                borderRadius: radii.field,
                padding: spacing.md,
              }}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: subtask.isDone }}
                disabled={readOnly}
                onPress={() => toggleDone.mutate(subtask)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 8,
                  backgroundColor: subtask.isDone ? "#59B08A" : "transparent",
                  borderWidth: subtask.isDone ? 0 : 1.5,
                  borderColor: colors.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {subtask.isDone ? (
                  <AppText size="caption" color={colors.surface}>
                    ✓
                  </AppText>
                ) : null}
              </Pressable>

              <AppText
                style={{ flex: 1, textDecorationLine: subtask.isDone ? "line-through" : "none" }}
                color={subtask.isDone ? colors.muted : colors.ink}
              >
                {subtask.title}
              </AppText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="المسؤولون عن المهمة الفرعية"
                disabled={readOnly}
                onPress={() => setAssigningId(subtask.id)}
                hitSlop={8}
              >
                {assignees.length > 0 ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: avatarColorFor(assignees[0]!.userId).bg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <AppText size="caption" weight="bold" color={avatarColorFor(assignees[0]!.userId).fg} style={{ fontSize: 10 }}>
                      {initials(assignees[0]!.user.displayName)}
                    </AppText>
                  </View>
                ) : (
                  <AppText size="small" color={colors.muted}>
                    + إسناد
                  </AppText>
                )}
              </Pressable>

              {!readOnly ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="حذف المهمة الفرعية"
                  onPress={() => remove.mutate(subtask.id)}
                  hitSlop={8}
                >
                  <AppText color={colors.alert}>✕</AppText>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {!readOnly ? (
        <View
          style={{
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.md,
          }}
        >
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="+ إضافة مهمة فرعية"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => newTitle.trim() && create.mutate(newTitle.trim())}
            returnKeyType="done"
            style={{
              minHeight: MIN_TOUCH_TARGET,
              fontFamily: fonts.regular,
              fontSize: fontSizes.body,
              color: colors.ink,
              textAlign: "right",
              writingDirection: "rtl",
            }}
          />
        </View>
      ) : null}

      <AssigneePickerSheet
        visible={!!assigningSubtask}
        onClose={() => setAssigningId(null)}
        title={assigningSubtask?.title ?? ""}
        subtitle="يمكن اختيار أكثر من شخص، ويجب أن يكون عضوًا في اللوحة."
        members={boardMembers}
        selectedIds={assigningSubtask?.assigneeIds ?? []}
        onSave={(userIds) => {
          if (assigningSubtask) updateAssignees.mutate({ id: assigningSubtask.id, userIds });
        }}
      />
    </View>
  );
}
