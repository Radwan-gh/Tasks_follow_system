import { Pressable, View } from "react-native";
import type { Card } from "@app/types";
import { AppText } from "@/components/text";
import { useOpenCard } from "@/lib/board-cache";
import { formatDueDate } from "@/lib/date";
import { colors, radii, spacing } from "@/theme/tokens";

/**
 * Which cycle of its repeating task this card is, and links to the instances
 * before and after it (docs/14 «ربط النسخ»). The neighbours come only with the
 * card's own `GET /cards/:id` — a card seeded from a board shows them once that
 * refetch lands.
 */
export function RecurrenceLinks({ card }: { card: Card }) {
  const openCard = useOpenCard();
  if (!card.recurrence && !card.previousInstanceId) return null;

  const rows = [
    { label: "المهمة السابقة", instance: card.previousInstance ?? null },
    { label: "المهمة التالية", instance: card.nextInstance ?? null },
  ].filter((row) => row.instance);
  if (!card.recurrenceIndex && rows.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      {card.recurrenceIndex ? (
        <AppText size="caption" color={colors.muted}>
          الدورة {card.recurrenceIndex} من هذه المهمة
        </AppText>
      ) : null}
      {rows.map(({ label, instance }) => (
        <Pressable
          key={label}
          accessibilityRole="link"
          accessibilityLabel={`${label}: ${instance!.title}`}
          onPress={() => openCard(instance!.id, instance!.boardId)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm,
            borderRadius: radii.field,
            backgroundColor: pressed ? colors.canvas : "transparent",
          })}
        >
          <AppText size="caption" color={colors.muted}>
            {label}
          </AppText>
          <AppText size="small" weight="semibold" color={colors.accent} numberOfLines={1} style={{ flex: 1 }}>
            {instance!.title}
          </AppText>
          {instance!.dueDate ? (
            <AppText size="caption" color={colors.muted}>
              {formatDueDate(instance!.dueDate)}
            </AppText>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
