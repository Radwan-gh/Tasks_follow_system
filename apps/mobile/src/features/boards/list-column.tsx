import { Pressable, View } from "react-native";
import type { Card, List } from "@app/types";
import { AppText } from "@/components/text";
import { CardItem } from "./card-item";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/** «العاجل أولاً، ثم الباقي بترتيبه اليدوي» (§3b-1) — a stable sort, so ties keep their server (position) order. */
export function sortByPriority<T extends Pick<Card, "priority">>(cards: T[]): T[] {
  return [...cards].sort((a, b) => (b.priority === "URGENT" ? 1 : 0) - (a.priority === "URGENT" ? 1 : 0));
}

export function ListColumn({
  list,
  width,
  resolveAssignees,
  hasNext,
  nextListIsClosed,
  canCloseCard,
  readOnly,
  onMoveCardNext,
  onLongPressCard,
  onOpenCard,
  onAddCard,
  showLoadOlder,
  onLoadOlder,
}: {
  list: List;
  width: number;
  resolveAssignees: (ids: string[]) => { id: string; displayName: string }[];
  hasNext: boolean;
  /** True when the next column is the `CLOSED` («انتهى») list — §3b-4. */
  nextListIsClosed: boolean;
  /** Whether the current user may move a given card into «انتهى» (board owner or the card's own assignees). */
  canCloseCard: (card: Card) => boolean;
  /** The board is archived: no add/move/drag — §3b-3. */
  readOnly: boolean;
  onMoveCardNext: (cardId: string) => void;
  onLongPressCard: (cardId: string) => void;
  onOpenCard: (cardId: string) => void;
  onAddCard: () => void;
  /** True only for the `CLOSED` list while it's windowed to the last 30 days. */
  showLoadOlder: boolean;
  onLoadOlder: () => void;
}) {
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

      {list.cards.length === 0 ? (
        <AppText size="small" color={colors.muted} style={{ paddingHorizontal: spacing.xs }}>
          لا مهام في هذه الحالة
        </AppText>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {sortByPriority(list.cards).map((card) => {
            const blockedByClose = nextListIsClosed && !canCloseCard(card);
            return (
              <CardItem
                key={card.id}
                card={card}
                assignees={resolveAssignees(card.assigneeIds)}
                hasNext={!readOnly && hasNext && !blockedByClose}
                onMoveNext={() => onMoveCardNext(card.id)}
                onLongPress={() => (readOnly ? undefined : onLongPressCard(card.id))}
                onOpen={() => onOpenCard(card.id)}
              />
            );
          })}
        </View>
      )}

      {showLoadOlder ? (
        <Pressable accessibilityRole="button" onPress={onLoadOlder} style={{ minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}>
          <AppText size="small" weight="semibold" color={colors.accent}>
            عرض الأقدم
          </AppText>
        </Pressable>
      ) : null}

      {readOnly ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={onAddCard}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            justifyContent: "center",
            paddingHorizontal: spacing.md,
            borderRadius: radii.card,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.line,
          }}
        >
          <AppText size="small" color={colors.muted}>
            + إضافة مهمة
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
