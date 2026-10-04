import { useRef } from "react";
import { Pressable, View } from "react-native";
import type { Card, List } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * The status picker: every status in board order (current disabled, the very
 * next one highlighted). Opened by long-pressing a card on the board and by
 * tapping the status chip in the task detail header — the visible way in, so
 * nobody has to discover the long-press to move a task more than one step.
 *
 * The board's long-press version also carries delete (`onRequestDelete`),
 * set apart below a divider so it never reads as one more move target. It
 * opens the shared `ConfirmSheet` (`design-prompt-group-3.md` §3a-6) rather
 * than deleting on the spot — see `board/[id].tsx`.
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
  /** Omit to leave delete out — the task detail screen's sheet only moves. */
  onRequestDelete?: () => void;
}) {
  // The board clears `card` the moment the sheet is dismissed; keep showing the
  // last one so the sheet can slide out instead of vanishing mid-animation.
  const lastCard = useRef(card);
  if (card) lastCard.current = card;
  const shown = card ?? lastCard.current;
  if (!shown) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
        <AppText weight="bold" size="title">
          نقل إلى
        </AppText>

        <View style={{ gap: spacing.sm }}>
          {lists.map((list) => {
            const isCurrent = list.id === shown.listId;
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
                    borderColor: isNext ? colors.accentSoft : colors.line,
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
                  <AppText size="caption" color={isNext ? colors.accent : colors.muted}>
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

        {onRequestDelete ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, marginTop: spacing.xs }}>
            <Pressable
              accessibilityRole="button"
              onPress={onRequestDelete}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                borderRadius: radii.field,
                backgroundColor: colors.alertSoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppText weight="semibold" color={colors.alert}>
                حذف المهمة
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
