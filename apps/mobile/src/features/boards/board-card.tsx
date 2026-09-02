import { Pressable, View } from "react-native";
import type { BoardSummary } from "@app/types";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { initials } from "@/lib/initials";
import { formatDueDate, isOverdue } from "@/lib/date";
import { colors, radii, spacing, statusColors } from "@/theme/tokens";

/**
 * One row in the boards list: name/role badge, optional description, an
 * optional due-date chip, a two-segment progress bar (done vs. remaining —
 * the design's three-segment done/in-progress/remaining bar isn't
 * reproducible from `GET /boards`, which only returns a done/total split,
 * not a per-status breakdown), overlapping member avatars, and the
 * "n مهمة · m مكتملة" counter.
 */
export function BoardCard({
  board,
  isOwner,
  onPress,
}: {
  board: BoardSummary;
  isOwner: boolean;
  onPress: () => void;
}) {
  const overdue = board.dueDate ? isOverdue(board.dueDate) : false;
  const doneRatio = board.cardCount > 0 ? board.doneCount / board.cardCount : 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.xl,
        gap: spacing.md,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText size="title" weight="semibold" numberOfLines={1}>
            {board.name}
          </AppText>
          {board.description ? (
            <AppText size="small" color={colors.muted} numberOfLines={2}>
              {board.description}
            </AppText>
          ) : null}
          {board.dueDate ? (
            <View
              style={{
                alignSelf: "flex-start",
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: overdue ? colors.alertSoft : colors.canvas,
                borderRadius: radii.chip,
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
                marginTop: spacing.xs,
              }}
            >
              <AppText size="caption" weight="semibold" color={overdue ? colors.alert : colors.muted}>
                ◷ التسليم {formatDueDate(board.dueDate)}
              </AppText>
            </View>
          ) : null}
        </View>
        <View
          style={{
            borderRadius: radii.chip,
            backgroundColor: isOwner ? colors.accentSoft : colors.canvas,
            paddingHorizontal: spacing.md,
            paddingVertical: 2,
          }}
        >
          <AppText size="caption" weight="medium" color={isOwner ? colors.accent : colors.muted}>
            {isOwner ? "مالك" : "عضو"}
          </AppText>
        </View>
      </View>

      {board.cardCount > 0 ? (
        <View style={{ height: 8, borderRadius: 999, backgroundColor: colors.canvas, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${doneRatio * 100}%`, backgroundColor: statusColors.DONE }} />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row" }}>
          {board.memberPreviews.map((member, index) => {
            const palette = avatarColorFor(member.id);
            return (
              <View
                key={member.id}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: palette.bg,
                  borderWidth: 2,
                  borderColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  marginInlineStart: index === 0 ? 0 : -12,
                }}
              >
                <AppText size="caption" weight="bold" color={palette.fg} style={{ fontSize: 11 }}>
                  {initials(member.displayName)}
                </AppText>
              </View>
            );
          })}
        </View>
        <AppText size="small" color={colors.muted}>
          {board.cardCount} مهمة · {board.doneCount} مكتملة
        </AppText>
      </View>
    </Pressable>
  );
}
