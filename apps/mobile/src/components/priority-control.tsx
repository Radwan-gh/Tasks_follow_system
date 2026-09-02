import { Pressable, View } from "react-native";
import type { CardPriority } from "@app/types";
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
 * uses its own small tappable-to-cycle chip instead (see `priorityChipStyle`).
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

/** Cycles منخفض → عادي → عاجل → منخفض, for the card-detail chip's tap-to-toggle. */
export function nextPriority(priority: CardPriority): CardPriority {
  const index = OPTIONS.findIndex((o) => o.value === priority);
  return OPTIONS[(index + 1) % OPTIONS.length]!.value;
}
