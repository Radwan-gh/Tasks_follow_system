import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { MyTaskItem } from "@app/types";
import { AppText } from "@/components/text";
import { formatDueDate, isOverdue, overdueLabel } from "@/lib/date";
import { colors, radii, spacing, statusChipColors, statusColors } from "@/theme/tokens";

/**
 * One row in `/my-tasks` — a card or a subtask — as screens 9/9b of
 * `Tasks Mobile Redesign.dc.html` draw it:
 *
 * - A subtask leads with a tick box and carries «ضمن: <its card>».
 * - Overdue: a red-bordered row, «◷ متأخّرة N أيام», then the board's name.
 * - Otherwise a card shows its status chip, its «☑ done/total» and its due
 *   chip; a subtask just its (card's) due chip.
 * - A card has the ← arrow that moves it to the board's next status.
 * - «عاجل» is the 3px stripe on the start (right) edge.
 */
export function TaskRow({
  item,
  onOpen,
  onMoveNext,
  onTick,
  busy = false,
}: {
  item: MyTaskItem;
  onOpen: () => void;
  /** Unset hides the arrow — a subtask row, or a card already in its board's last list. */
  onMoveNext?: () => void;
  /** Ticks a subtask row done. */
  onTick?: () => void;
  /** A move or tick is in flight: the row dims and ignores further taps. */
  busy?: boolean;
}) {
  const overdue = item.dueDate ? isOverdue(item.dueDate) : false;
  const isSubtask = item.kind === "SUBTASK";
  const chip = item.statusCategory === "IN_PROGRESS" ? statusChipColors.IN_PROGRESS : statusChipColors.default;

  const moveArrow = onMoveNext ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="نقل إلى الحالة التالية"
      disabled={busy}
      onPress={onMoveNext}
      // The design draws the arrow at 36px; the slop brings the tap area to
      // the 44px minimum without growing what is drawn.
      hitSlop={4}
      style={{
        width: 36,
        height: 36,
        flexShrink: 0,
        borderRadius: radii.iconButton,
        backgroundColor: colors.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText color={colors.accent} style={{ fontSize: 16, lineHeight: 22 }}>
        ←
      </AppText>
    </Pressable>
  ) : null;

  const meta: ReactNode[] = [];
  if (overdue && item.dueDate) {
    meta.push(<Chip key="due" label={`◷ ${overdueLabel(item.dueDate)}`} background={colors.alertSoft} color={colors.alert} bold />);
    meta.push(
      <AppText key="board" size="caption" color={colors.muted}>
        {item.boardName}
      </AppText>,
    );
  } else {
    if (!isSubtask) {
      meta.push(
        <View
          key="status"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            backgroundColor: chip.bg,
            borderRadius: radii.chip,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: radii.chip,
              backgroundColor: statusColors[item.statusCategory ?? "UNCATEGORIZED"],
            }}
          />
          <AppText size="caption" color={chip.fg}>
            {item.listName}
          </AppText>
        </View>,
      );
      if (item.subtaskTotal > 0) {
        meta.push(
          <AppText
            key="subtasks"
            size="caption"
            color={colors.muted}
            accessibilityLabel={`أُنجزت ${item.subtaskDone} من ${item.subtaskTotal} مهام فرعية`}
          >
            {/* Isolated left-to-right, so "done/total" never flips in RTL. */}☑ ⁦{item.subtaskDone}/{item.subtaskTotal}⁩
          </AppText>,
        );
      }
    }
    if (item.dueDate) {
      meta.push(<Chip key="due" label={`◷ ${formatDueDate(item.dueDate)}`} background={colors.chip} color={colors.muted} />);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      disabled={busy}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: overdue ? colors.alertLine : colors.line,
        borderRadius: radii.row,
        padding: spacing.lg,
        gap: spacing.md,
        overflow: "hidden",
        opacity: busy ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      {item.priority === "URGENT" ? (
        // `start` is the right edge under RTL — where the design puts it.
        <View style={{ position: "absolute", top: 0, bottom: 0, start: 0, width: 3, backgroundColor: colors.urgent }} />
      ) : null}

      {isSubtask ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: busy, disabled: busy }}
            accessibilityLabel={`إنجاز «${item.title}»`}
            disabled={busy || !onTick}
            onPress={onTick}
            hitSlop={12}
            style={{
              width: 20,
              height: 20,
              marginTop: 2,
              borderRadius: 7,
              borderWidth: 1.5,
              borderColor: busy ? colors.accent : colors.lineStrong,
              backgroundColor: busy ? colors.accent : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {busy ? (
              <AppText color={colors.surface} style={{ fontSize: 12, lineHeight: 14 }}>
                ✓
              </AppText>
            ) : null}
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            <AppText style={TITLE_STYLE}>
              {item.title}
            </AppText>
            <AppText size="caption" color={colors.faint}>
              ضمن: {item.parentCardTitle}
            </AppText>
          </View>
        </View>
      ) : (
        <AppText style={TITLE_STYLE}>
          {item.title}
        </AppText>
      )}

      {meta.length > 0 || moveArrow ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
            {meta}
          </View>
          {moveArrow}
        </View>
      ) : null}
    </Pressable>
  );
}

/** A task title in a list: regular 16 (400, the user's pick). */
const TITLE_STYLE = { fontSize: 16, lineHeight: 25 } as const;

function Chip({ label, background, color, bold = false }: { label: string; background: string; color: string; bold?: boolean }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: background,
        borderRadius: radii.chip,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <AppText size="caption" weight={bold ? "medium" : "regular"} color={color}>
        {label}
      </AppText>
    </View>
  );
}
