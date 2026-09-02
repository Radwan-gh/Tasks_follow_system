import { Pressable, View } from "react-native";
import type { Card, List } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * The design's long-press sheet: every status in board order (current
 * disabled, the very next one highlighted) plus delete. "فتح البطاقة" is left
 * out — there is no card detail screen yet, so a row for it would go nowhere.
 * Delete itself opens the shared `ConfirmSheet` (`design-prompt-group-3.md`
 * §3a-6) rather than an inline tap-twice toggle — see `board/[id].tsx`.
 */
export function MoveCardSheet({
  visible,
  onClose,
  card,
  lists,
  nextListId,
  onMove,
  onRequestDelete,
}: {
  visible: boolean;
  onClose: () => void;
  card: Card | null;
  lists: List[];
  nextListId: string | null;
  onMove: (targetListId: string) => void;
  onRequestDelete: () => void;
}) {
  if (!card) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <AppText weight="bold" size="title">
          نقل إلى
        </AppText>

        <View style={{ gap: spacing.sm }}>
          {lists.map((list) => {
            const isCurrent = list.id === card.listId;
            const isNext = list.id === nextListId;
            return (
              <Pressable
                key={list.id}
                disabled={isCurrent}
                accessibilityRole="button"
                onPress={() => onMove(list.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  minHeight: MIN_TOUCH_TARGET,
                  borderRadius: radii.field,
                  borderWidth: 1,
                  borderColor: isNext ? "#D6E1F8" : colors.line,
                  backgroundColor: isNext ? colors.accentSoft : isCurrent ? colors.canvas : colors.surface,
                  paddingHorizontal: spacing.lg,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: statusColors[list.statusCategory ?? "UNCATEGORIZED"],
                  }}
                />
                <AppText style={{ flex: 1 }} weight={isNext ? "semibold" : "regular"} color={isCurrent ? colors.muted : colors.ink}>
                  {list.name}
                </AppText>
                <AppText size="caption" color={isNext ? "#7C8CA8" : colors.muted}>
                  {isCurrent ? "الحالة الحالية" : isNext ? "التالية" : list.cards.length}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onRequestDelete}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: colors.alertSoft,
            alignItems: "center",
            justifyContent: "center",
            marginTop: spacing.sm,
          }}
        >
          <AppText weight="semibold" color={colors.alert}>
            حذف
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
