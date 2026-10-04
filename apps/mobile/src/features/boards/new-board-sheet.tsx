import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { DueDateSheet } from "@/components/due-date-sheet";
import { AppText } from "@/components/text";
import { formatDueDate } from "@/lib/date";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * New-board bottom sheet: name and optional due date. The server seeds every
 * new board with the five status lists, so there is no starter choice here.
 */
export function NewBoardSheet({
  visible,
  onClose,
  onCreate,
  creating,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; dueDate: string | null }) => void;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [pickingDueDate, setPickingDueDate] = useState(false);

  function close() {
    setName("");
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
          onPress={() => onCreate({ name: name.trim(), dueDate })}
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
