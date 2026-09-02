import { Pressable, View } from "react-native";
import type { Card } from "@app/types";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { formatDueDate, isOverdue } from "@/lib/date";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/**
 * The board screen's card face. Deliberately omits a subtasks chip (☑ n/m in
 * the design) — that needs `subtaskDone`/`subtaskTotal` on `GET /boards/:id`,
 * which the API doesn't return yet (see `v2-new-style.md` §4).
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
  card: Card;
  assignees: { id: string; displayName: string }[];
  hasNext: boolean;
  onMoveNext: () => void;
  onLongPress: () => void;
  onOpen: () => void;
  /** In-board search (§3b-2): highlights the matched substring in the title. */
  highlightQuery?: string;
}) {
  const overdue = card.dueDate ? isOverdue(card.dueDate) : false;

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
        borderRightWidth: card.priority === "URGENT" ? 3 : 1,
        borderRightColor: card.priority === "URGENT" ? colors.urgent : colors.line,
        borderRadius: radii.card,
        padding: spacing.lg,
        gap: spacing.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
        {card.isRestricted ? <AppText size="small">🔒</AppText> : null}
        <AppText weight="semibold" style={{ flex: 1 }}>
          <HighlightedTitle title={card.title} query={highlightQuery} />
        </AppText>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          {card.dueDate ? (
            <Chip
              label={`◷ ${formatDueDate(card.dueDate)}`}
              background={overdue ? colors.alertSoft : colors.canvas}
              color={overdue ? colors.alert : colors.muted}
            />
          ) : null}
          {card.recurrence ? (
            <AppText size="small" color={colors.muted}>
              ↻
            </AppText>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Avatars assignees={assignees} />
          {hasNext ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="نقل إلى الحالة التالية"
              onPress={onMoveNext}
              hitSlop={8}
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
          ) : null}
        </View>
      </View>
    </Pressable>
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
