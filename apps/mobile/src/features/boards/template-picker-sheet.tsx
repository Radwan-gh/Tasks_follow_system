import { Pressable, ScrollView, View } from "react-native";
import type { Template } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/** §3c-3 "إضافة مهمة: صف «استخدام قالب ▾»" — selecting prefills title/description/subtasks (still editable afterwards). */
export function TemplatePickerSheet({
  visible,
  onClose,
  templates,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  templates: Template[];
  onSelect: (template: Template) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, maxHeight: "80%", paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          استخدام قالب
        </AppText>
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: spacing.sm }}>
          {templates.map((template) => (
            <Pressable
              key={template.id}
              accessibilityRole="button"
              onPress={() => {
                onSelect(template);
                onClose();
              }}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                justifyContent: "center",
                paddingHorizontal: spacing.lg,
                borderRadius: radii.card,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <AppText weight="semibold">{template.name}</AppText>
              <AppText size="caption" color={colors.muted}>
                {template.subtaskTitles.length} مهام فرعية
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
