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
  canCloseCard,
  onMove,
  onRequestDelete,
}: {
  visible: boolean;
  onClose: () => void;
  card: Card | null;
  lists: List[];
  nextListId: string | null;
  /** Whether the current user may move *this* card into «انتهى» — §3b-4. */
  canCloseCard: boolean;
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
            const blocked = list.statusCategory === "CLOSED" && !isCurrent && !canCloseCard;
            return (
              <View key={list.id}>
                <Pressable
                  disabled={isCurrent || blocked}
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
                    backgroundColor: isNext ? colors.accentSoft : isCurrent || blocked ? colors.canvas : colors.surface,
                    paddingHorizontal: spacing.lg,
                    opacity: blocked ? 0.6 : 1,
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
                  <AppText style={{ flex: 1 }} weight={isNext ? "semibold" : "regular"} color={isCurrent || blocked ? colors.muted : colors.ink}>
                    {list.name}
                  </AppText>
                  <AppText size="caption" color={isNext ? "#7C8CA8" : colors.muted}>
                    {isCurrent ? "الحالة الحالية" : isNext ? "التالية" : list.cards.length}
                  </AppText>
                </Pressable>
                {blocked ? (
                  <AppText size="caption" color={colors.muted} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xs }}>
                    ينقلها إلى انتهى مالك اللوحة أو المسؤول عنها
                  </AppText>
                ) : null}
              </View>
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
