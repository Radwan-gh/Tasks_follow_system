import { Pressable, View } from "react-native";
import type { MyTaskItem } from "@app/types";
import { AppText } from "@/components/text";
import { formatDueDate, isOverdue } from "@/lib/date";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/** One row in `/my-tasks` — a card or a subtask, the latter carrying its parent card's title. */
export function TaskRow({ item, onPress }: { item: MyTaskItem; onPress: () => void }) {
  const overdue = item.dueDate ? isOverdue(item.dueDate) : false;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        // borderLeft* (not borderRight*): RN's default RTL behavior mirrors
        // physical left/right border props under forceRTL, so this renders
        // on the physical right edge — see card-item.tsx for the same fix.
        borderLeftWidth: item.priority === "URGENT" ? 3 : 1,
        borderLeftColor: item.priority === "URGENT" ? colors.urgent : colors.line,
        borderRadius: radii.card,
        padding: spacing.lg,
        gap: spacing.xs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <AppText weight="semibold">{item.title}</AppText>
      {item.kind === "SUBTASK" ? (
        <AppText size="caption" color={colors.muted}>
          ضمن: {item.parentCardTitle}
        </AppText>
      ) : null}
      {item.dueDate ? (
        <View
          style={{
            alignSelf: "flex-start",
            marginTop: spacing.xs,
            backgroundColor: overdue ? colors.alertSoft : colors.canvas,
            borderRadius: radii.chip,
            paddingHorizontal: spacing.md,
            paddingVertical: 4,
          }}
        >
          <AppText size="caption" weight="semibold" color={overdue ? colors.alert : colors.muted}>
            ◷ {formatDueDate(item.dueDate)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
