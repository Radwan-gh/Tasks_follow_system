import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardCard } from "@app/types";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { formatDueDate, isOverdue } from "@/lib/date";
import { MIN_TOUCH_TARGET, colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * The board screen's card face. Its height follows its content: a card with
 * nothing but a title is a single row, with the move arrow beside the title,
 * and the second row only appears when there is something to put in it — a
 * due date, recurrence, people, or a hint of what is inside (description,
 * attachment count, subtask fraction), so nobody has to open every card to
 * find out. Density matters more on this screen than anywhere else.
 */
export function CardItem({
  card,
  assignees,
  hasNext,
  onMoveNext,
  onLongPress,
  onOpen,
  highlightQuery,
}: {
  card: BoardCard;
  assignees: { id: string; displayName: string }[];
  hasNext: boolean;
  onMoveNext: () => void;
  onLongPress: () => void;
  onOpen: () => void;
  /** In-board search (§3b-2): highlights the matched substring in the title. */
  highlightQuery?: string;
}) {
  const overdue = card.dueDate ? isOverdue(card.dueDate) : false;
  const hasDescription = !!card.description?.trim();
  const hasMeta =
    !!card.dueDate ||
    !!card.recurrence ||
    hasDescription ||
    card.attachmentCount > 0 ||
    card.subtaskTotal > 0 ||
    assignees.length > 0;
  const subtasksDone = card.subtaskTotal > 0 && card.subtaskDone === card.subtaskTotal;

  // No `hitSlop`: the arrow sits inside the card's own tap area, and a slop
  // ring is exactly what turned near-miss "open" taps into silent moves.
  const moveArrow = hasNext ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="نقل إلى الحالة التالية"
      onPress={onMoveNext}
      style={{
        width: MIN_TOUCH_TARGET - 4,
        height: MIN_TOUCH_TARGET - 4,
        borderRadius: 13,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText color={colors.accent}>←</AppText>
    </Pressable>
  ) : null;

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        // §3b-1: a 3px right-edge stripe is the *only* face indicator for
        // priority, and only ever for «عاجل» — normal/low stay unmarked.
        // Written as borderLeft* because RN's default RTL behavior
        // (I18nManager.doLeftAndRightSwapInRTL, on by default) mirrors
        // physical left/right border props under forceRTL — this renders
        // on the physical *right* edge, matching the design.
        borderLeftWidth: card.priority === "URGENT" ? 3 : 1,
        borderLeftColor: card.priority === "URGENT" ? colors.urgent : colors.line,
        borderRadius: radii.card,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.sm,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          minHeight: moveArrow && !hasMeta ? MIN_TOUCH_TARGET - 4 : undefined,
        }}
      >
        {card.isRestricted ? <AppText size="small">🔒</AppText> : null}
        <AppText weight="semibold" style={{ flex: 1 }}>
          <HighlightedTitle title={card.title} query={highlightQuery} />
        </AppText>
        {hasMeta ? null : moveArrow}
      </View>

      {hasMeta ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
            {card.dueDate ? (
              <Chip
                label={`◷ ${formatDueDate(card.dueDate)}`}
                background={overdue ? colors.alertSoft : colors.canvas}
                color={overdue ? colors.alert : colors.muted}
              />
            ) : null}
            {card.recurrence ? (
              <AppText size="small" color={colors.muted} accessibilityLabel="مهمة متكررة">
                ↻
              </AppText>
            ) : null}
            {hasDescription ? (
              <View accessible accessibilityLabel="فيها وصف">
                <Ionicons name="reorder-three-outline" size={17} color={colors.muted} />
              </View>
            ) : null}
            {card.attachmentCount > 0 ? (
              <Meta icon="attach" label={String(card.attachmentCount)} accessibilityLabel={`${card.attachmentCount} مرفقات`} />
            ) : null}
            {card.subtaskTotal > 0 ? (
              <Meta
                icon="checkbox-outline"
                // Isolated left-to-right, so "done/total" never flips to "total/done" in RTL.
                label={`⁦${card.subtaskDone}/${card.subtaskTotal}⁩`}
                color={subtasksDone ? statusColors.DONE : colors.muted}
                accessibilityLabel={`أُنجزت ${card.subtaskDone} من ${card.subtaskTotal} مهام فرعية`}
              />
            ) : null}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Avatars assignees={assignees} />
            {moveArrow}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

/** One glyph and its count on the card's meta row. */
function Meta({
  icon,
  label,
  color = colors.muted,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
  accessibilityLabel: string;
}) {
  return (
    <View accessible accessibilityLabel={accessibilityLabel} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Ionicons name={icon} size={15} color={color} />
      <AppText size="caption" weight="semibold" color={color}>
        {label}
      </AppText>
    </View>
  );
}

/** Splits `title` around the first case-insensitive match of `query`, highlighting it with `accentSoft` (§3b-2). */
function HighlightedTitle({ title, query }: { title: string; query?: string }) {
  if (!query || !query.trim()) return <>{title}</>;
  const index = title.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index === -1) return <>{title}</>;
  const end = index + query.trim().length;
  return (
    <>
      {title.slice(0, index)}
      <AppText weight="bold" color={colors.accent} style={{ backgroundColor: colors.accentSoft }}>
        {title.slice(index, end)}
      </AppText>
      {title.slice(end)}
    </>
  );
}

function Chip({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: background,
        borderRadius: radii.chip,
        paddingHorizontal: spacing.md,
        paddingVertical: 5,
      }}
    >
      <AppText size="caption" weight="semibold" color={color}>
        {label}
      </AppText>
    </View>
  );
}

function Avatars({ assignees }: { assignees: { id: string; displayName: string }[] }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {assignees.slice(0, 3).map((person, index) => {
        const palette = avatarColorFor(person.id);
        return (
          <View
            key={person.id}
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              backgroundColor: palette.bg,
              borderWidth: 2,
              borderColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
              marginInlineStart: index === 0 ? 0 : -10,
            }}
          >
            <AppText weight="bold" color={palette.fg} style={{ fontSize: 10, lineHeight: 12 }}>
              {initials(person.displayName)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
