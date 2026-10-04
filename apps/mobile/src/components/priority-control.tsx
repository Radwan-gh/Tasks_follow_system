import { Pressable, View } from "react-native";
import type { CardPriority } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

const OPTIONS: { value: CardPriority; label: string }[] = [
  { value: "LOW", label: "منخفض" },
  { value: "NORMAL", label: "عادي" },
  { value: "URGENT", label: "عاجل" },
];

/**
 * "الأولوية" three-way segmented switch (`design-prompt-group-3.md` §3b-1):
 * منخفض · عادي (افتراضي) · عاجل. Used by the add-task screen; card detail
 * shows a chip that opens `PrioritySheet` instead.
 */
export function PrioritySegmented({ value, onChange }: { value: CardPriority; onChange: (v: CardPriority) => void }) {
  return (
    <View style={{ flexDirection: "row", borderRadius: radii.field, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET - 4,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? (option.value === "URGENT" ? colors.urgentSoft : colors.accentSoft) : colors.surface,
            }}
          >
            <AppText
              size="small"
              weight={active ? "semibold" : "regular"}
              color={active ? (option.value === "URGENT" ? colors.urgent : colors.accent) : colors.muted}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "عاجل" (only) — `design-prompt-group-3.md`: "«عاجل» وحده يظهر على وجه البطاقة". */
export function isUrgent(priority: CardPriority): boolean {
  return priority === "URGENT";
}

export function priorityLabel(priority: CardPriority): string {
  return OPTIONS.find((o) => o.value === priority)?.label ?? priority;
}

/**
 * The task detail header's priority picker. It replaced a chip that cycled on
 * every tap and saved each step: a blind cycle hid the options, and a mis-tap
 * was already on the server. Picking a row here is the deliberate act, so it
 * saves straight away — like the cost sheet — and the header chip shows it.
 */
export function PrioritySheet({
  visible,
  onClose,
  value,
  onChange,
  saving,
  failed,
}: {
  visible: boolean;
  onClose: () => void;
  value: CardPriority;
  onChange: (value: CardPriority) => void;
  saving: boolean;
  failed: boolean;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          الأولوية
        </AppText>
        <View style={{ gap: spacing.sm }}>
          {OPTIONS.map((option) => {
            const active = option.value === value;
            const tint = option.value === "URGENT" ? colors.urgent : colors.accent;
            const tintSoft = option.value === "URGENT" ? colors.urgentSoft : colors.accentSoft;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: saving }}
                disabled={saving}
                onPress={() => (active ? onClose() : onChange(option.value))}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: MIN_TOUCH_TARGET,
                  borderRadius: radii.field,
                  borderWidth: 1,
                  borderColor: active ? tintSoft : colors.line,
                  backgroundColor: active ? tintSoft : colors.surface,
                  paddingHorizontal: spacing.lg,
                }}
              >
                <AppText style={{ flex: 1 }} weight={active ? "semibold" : "regular"} color={active ? tint : colors.ink}>
                  {option.label}
                </AppText>
                {active ? (
                  <AppText size="caption" color={tint}>
                    الحالية
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <AppText size="caption" color={failed ? colors.alert : colors.muted}>
          {failed
            ? "تعذّر حفظ الأولوية. تحقّق من الاتصال وأعد المحاولة."
            : saving
              ? "جارٍ الحفظ..."
              : "«عاجل» وحدها تظهر على وجه البطاقة في اللوحة."}
        </AppText>
      </View>
    </BottomSheet>
  );
}
