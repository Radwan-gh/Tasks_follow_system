import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { Card, List } from "@app/types";
import { AppText } from "@/components/text";
import { sortByPriority } from "@/lib/reorder";
import { CardItem } from "./card-item";
import { DraggableCard, DropPlaceholder } from "./board-drag";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

export { sortByPriority };

export function ListColumn({
  list,
  width,
  resolveAssignees,
  hasNext,
  nextListIsClosed,
  canCloseCard,
  canEditCard,
  readOnly,
  onMoveCardNext,
  onLongPressCard,
  onOpenCard,
  showLoadOlder,
  onLoadOlder,
  dragEnabled,
  draggingCardId,
  dropSlot,
}: {
  list: List;
  width: number;
  resolveAssignees: (ids: string[]) => { id: string; displayName: string }[];
  hasNext: boolean;
  /** True when the next column is the `CLOSED` («انتهى») list — §3b-4. */
  nextListIsClosed: boolean;
  /** Whether the current user may move a given card into «انتهى» (board owner or the card's own assignees). */
  canCloseCard: (card: Card) => boolean;
  /** Whether the current user owns a card (board owner or creator) — only then may they move it at all. */
  canEditCard: (card: Card) => boolean;
  /** The board is archived: no add/move/drag — §3b-3. */
  readOnly: boolean;
  onMoveCardNext: (cardId: string) => void;
  onLongPressCard: (cardId: string) => void;
  onOpenCard: (cardId: string) => void;
  /** True only for the `CLOSED` list while it's windowed to the last 30 days. */
  showLoadOlder: boolean;
  onLoadOlder: () => void;
  /** Cards can be lifted and dragged (design §5c) — never on a read-only board. */
  dragEnabled: boolean;
  /** The card being dragged right now, anywhere on the board. */
  draggingCardId: string | null;
  /** Where the dragged card would land in this column, when it is over it. */
  dropSlot: { slot: number; height: number } | null;
}) {
  const shown = sortByPriority(list.cards);
  const visibleCount = shown.filter((c) => c.id !== draggingCardId).length;
  const items: ReactNode[] = [];
  let slot = 0;
  for (const card of shown) {
    const isDragged = card.id === draggingCardId;
    if (!isDragged) {
      if (dropSlot && dropSlot.slot === slot) items.push(<DropPlaceholder key="drop-placeholder" height={dropSlot.height} />);
      slot++;
    }
    const blockedByClose = nextListIsClosed && !canCloseCard(card);
    // A task the user doesn't own can't be moved: no arrow, no drag, no move sheet.
    const locked = readOnly || !canEditCard(card);
    const draggable = dragEnabled && !locked && !card.id.startsWith("temp:");
    items.push(
      <DraggableCard
        key={card.id}
        cardId={card.id}
        enabled={draggable}
        hidden={isDragged}
        animateLayout={!!draggingCardId}
      >
        <CardItem
          card={card}
          assignees={resolveAssignees(card.assigneeIds)}
          hasNext={!locked && hasNext && !blockedByClose}
          onMoveNext={() => onMoveCardNext(card.id)}
          // On a draggable card the same hold lifts it instead; letting go
          // without moving opens the sheet from there (`board-drag.tsx`).
          onLongPress={draggable || locked ? undefined : () => onLongPressCard(card.id)}
          onOpenActions={draggable ? () => onLongPressCard(card.id) : undefined}
          onOpen={() => onOpenCard(card.id)}
        />
      </DraggableCard>,
    );
  }
  if (dropSlot && dropSlot.slot >= slot) items.push(<DropPlaceholder key="drop-placeholder" height={dropSlot.height} />);

  return (
    <View style={{ width, gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: statusColors[list.statusCategory ?? "UNCATEGORIZED"],
          }}
        />
        <AppText weight="bold" size="small">
          {list.name}
        </AppText>
        <AppText size="caption" color={colors.muted}>
          {list.cards.length}
        </AppText>
      </View>

      {showLoadOlder ? (
        <View style={{ backgroundColor: colors.canvas, borderRadius: radii.field, padding: spacing.md }}>
          <AppText size="caption" color={colors.muted} style={{ textAlign: "center" }}>
            تُعرض المهام التي انتهت خلال آخر 30 يومًا
          </AppText>
        </View>
      ) : null}

      {visibleCount === 0 && !dropSlot ? (
        <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
          لا مهام في هذه الحالة
        </AppText>
      ) : null}
      {items.length > 0 ? <View style={{ gap: spacing.sm }}>{items}</View> : null}

      {showLoadOlder ? (
        <Pressable accessibilityRole="button" onPress={onLoadOlder} style={{ minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}>
          <AppText size="small" weight="semibold" color={colors.accent}>
            عرض الأقدم
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
