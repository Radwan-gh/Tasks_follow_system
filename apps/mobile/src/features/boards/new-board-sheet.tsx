import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { BoardTemplate } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { AppText } from "@/components/text";
import { formatDueDate } from "@/lib/date";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * New-board bottom sheet: name, starter template, optional due date.
 * `TASK_WORKFLOW` is the default (matches `apps/web`'s create-board form —
 * new boards start with the five status lists rather than empty).
 */
export function NewBoardSheet({
  visible,
  onClose,
  onCreate,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; template: BoardTemplate; dueDate: string | null }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<BoardTemplate>("TASK_WORKFLOW");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [pickingDueDate, setPickingDueDate] = useState(false);

  function close() {
    setName("");
    setTemplate("TASK_WORKFLOW");
    setDueDate(null);
    onClose();
  }

  const canCreate = name.trim().length > 0 && !creating;

  return (
    <BottomSheet visible={visible} onClose={close}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          لوحة جديدة
        </AppText>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="اسم اللوحة"
          placeholderTextColor={colors.muted}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.lg,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />

        <View style={{ gap: spacing.sm }}>
          <TemplateOption
            label="قالب سير العمل"
            note="خمس حالات جاهزة: جديد، جاهز للتنفيذ، قيد التنفيذ، تم التنفيذ، انتهى"
            selected={template === "TASK_WORKFLOW"}
            onPress={() => setTemplate("TASK_WORKFLOW")}
          />
          <TemplateOption
            label="لوحة فارغة"
            note="أضف حالاتك الخاصة بعد الإنشاء"
            selected={template === "EMPTY"}
            onPress={() => setTemplate("EMPTY")}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setPickingDueDate(true)}
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
            موعد التسليم
          </AppText>
          <AppText size="small" weight="semibold">
            {dueDate ? formatDueDate(dueDate) : "بلا موعد"}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={!canCreate}
          onPress={() => onCreate({ name: name.trim(), template, dueDate })}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: canCreate ? colors.accent : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={canCreate ? colors.surface : colors.muted}>
            {creating ? "جارٍ الإنشاء..." : "إنشاء اللوحة"}
          </AppText>
        </Pressable>
      </View>

      <DueDateSheet visible={pickingDueDate} onClose={() => setPickingDueDate(false)} onChange={setDueDate} />
    </BottomSheet>
  );
}

function TemplateOption({
  label,
  note,
  selected,
  onPress,
}: {
  label: string;
  note: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        borderWidth: 1,
        borderColor: selected ? "#D6E1F8" : colors.line,
        backgroundColor: selected ? colors.accentSoft : colors.surface,
        borderRadius: radii.card,
        padding: spacing.md,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.line,
          backgroundColor: selected ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.surface }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="semibold" size="small">
          {label}
        </AppText>
        <AppText size="caption" color={colors.muted}>
          {note}
        </AppText>
      </View>
    </Pressable>
  );
}
