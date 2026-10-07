import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardSummary } from "@app/types";
import { AppText } from "@/components/text";
import { avatarColorFor } from "@/lib/avatar";
import { isOverdue } from "@/lib/date";
import { TASKS, countLabel } from "@/lib/plural";
import { colors, radii, spacing } from "@/theme/tokens";

/**
 * A board inside a category section — the design's compact row (dot, name,
 * one counts line) rather than the full `BoardCard`, so a category of several
 * boards reads as one group. The line turns red once the board's own due date
 * has passed with work still open.
 */
export function BoardRow({ board, onPress }: { board: BoardSummary; onPress: () => void }) {
  const late = !!board.dueDate && isOverdue(board.dueDate) && board.doneCount < board.cardCount;
  const counts =
    board.cardCount === 0
      ? "لا مهام بعد"
      : `${countLabel(board.cardCount, TASKS)} · ${board.doneCount === board.cardCount ? "كلها مكتملة" : `${board.doneCount} مكتملة`}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${board.name}، ${counts}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radii.field + 2,
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: avatarColorFor(board.id).fg }} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold" numberOfLines={1}>
          {board.name}
        </AppText>
        <AppText size="caption" color={late ? colors.alert : colors.muted} numberOfLines={1}>
          {late ? `${counts} · تجاوزت موعد التسليم` : counts}
        </AppText>
      </View>
      <Ionicons name="chevron-back" size={16} color={colors.muted} />
    </Pressable>
  );
}
