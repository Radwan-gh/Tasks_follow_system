import { Pressable, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { formatHijri } from "@/lib/hijri";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/**
 * Quick-pick due date sheet, shared by card detail, add-task, and the
 * new-board sheet. A full calendar (per the design's "ورقة التاريخ") is a
 * later feature — this covers the common cases without a new native
 * date-picker dependency; each option does show the §3c-2 Hijri secondary
 * line under its Gregorian date.
 */
export function DueDateSheet({
  visible,
  onClose,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  onChange: (iso: string | null) => void;
}) {
  const options: { label: string; value: () => string | null }[] = [
    { label: "اليوم", value: () => atNoonInDays(0) },
    { label: "غدًا", value: () => atNoonInDays(1) },
    { label: "بعد 3 أيام", value: () => atNoonInDays(3) },
    { label: "الأسبوع القادم", value: () => atNoonInDays(7) },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title" style={{ marginBottom: spacing.xs }}>
          موعد التسليم
        </AppText>
        {options.map((option) => {
          const iso = option.value();
          return (
            <Pressable
              key={option.label}
              accessibilityRole="button"
              onPress={() => {
                onChange(iso);
                onClose();
              }}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                justifyContent: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: 6,
                borderRadius: radii.field,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <AppText>{option.label}</AppText>
              <AppText size="caption" color={colors.muted}>
                الموافق {formatHijri(new Date(iso!))}
              </AppText>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onChange(null);
            onClose();
          }}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: radii.field,
            backgroundColor: colors.alertSoft,
            marginTop: spacing.sm,
          }}
        >
          <AppText color={colors.alert} weight="semibold">
            إزالة الموعد
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function atNoonInDays(n: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + n);
  return date.toISOString();
}
