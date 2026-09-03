import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, fonts, fontSizes, radii, spacing } from "@/theme/tokens";

/** §3c-3 "حفظ كقالب" — card detail's ⋯ menu (owner-only): a simple naming sheet. */
export function SaveAsTemplateSheet({
  visible,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          حفظ كقالب
        </AppText>
        <AppText size="small" color={colors.muted}>
          يُحفظ العنوان والوصف والمهام الفرعية الحالية كقالب لهذه اللوحة.
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="اسم القالب"
          placeholderTextColor={colors.muted}
          autoFocus
          style={{
            minHeight: MIN_TOUCH_TARGET,
            backgroundColor: colors.canvas,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radii.field,
            paddingHorizontal: spacing.md,
            fontFamily: fonts.regular,
            fontSize: fontSizes.body,
            color: colors.ink,
            textAlign: "right",
            writingDirection: "rtl",
          }}
        />
        <Pressable
          accessibilityRole="button"
          disabled={name.trim().length === 0 || saving}
          onPress={() => onSave(name.trim())}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: name.trim().length === 0 ? colors.line : colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AppText weight="semibold" color={colors.surface}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
