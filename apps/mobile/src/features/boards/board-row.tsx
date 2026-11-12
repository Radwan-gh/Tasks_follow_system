import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { BoardSummary } from "@app/types";
import { AppText } from "@/components/text";
import { isOverdue } from "@/lib/date";
import { MEMBERS, TASKS, countLabel } from "@/lib/plural";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/**
 * Where the tree's trunk runs, measured from the list's start edge: the
 * centre of the category header's icon tile (border 1 + padding 12 + half of
 * the 28px tile), so the branches visibly grow out of the category.
 */
export const TREE_TRUNK_X = 26;
const TREE_INDENT = 40;
/** The elbow meets the board's name line, whatever height the row ends up. */
const ELBOW_Y = 21;

/**
 * A board as a leaf of its category's tree on the boards list: the branch
 * connector, the name, and a members button (people icon + count) that opens
 * `BoardMembersSheet` — no names inline, no task count and no progress bar on
 * screen (by the user's choice); the counts and a passed due date are still
 * read out to screen readers. `branch` off draws a bare leaf for the flat list
 * (no categories at all).
 */
export function BoardRow({
  board,
  onPress,
  onShowMembers,
  branch = true,
  last = false,
}: {
  board: BoardSummary;
  onPress: () => void;
  onShowMembers: () => void;
  branch?: boolean;
  /** The last leaf's trunk stops at its elbow instead of running on. */
  last?: boolean;
}) {
  const late = !!board.dueDate && isOverdue(board.dueDate) && board.doneCount < board.cardCount;
  const counts =
    board.cardCount === 0
      ? "لا مهام بعد"
      : `${countLabel(board.cardCount, TASKS)}، ${board.doneCount === board.cardCount ? "كلها مكتملة" : `${board.doneCount} مكتملة`}`;

  return (
    <View style={{ flexDirection: "row" }}>
      {branch ? (
        <View style={{ width: TREE_INDENT }}>
          <View
            style={{
              position: "absolute",
              start: TREE_TRUNK_X,
              top: 0,
              width: 1.5,
              height: last ? ELBOW_Y : "100%",
              backgroundColor: colors.lineStrong,
            }}
          />
          <View
            style={{
              position: "absolute",
              start: TREE_TRUNK_X,
              top: ELBOW_Y - 0.75,
              width: TREE_INDENT - TREE_TRUNK_X - 2,
              height: 1.5,
              backgroundColor: colors.lineStrong,
            }}
          />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${board.name}، ${counts}${late ? "، تجاوزت موعد التسليم" : ""}`}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: spacing.sm,
          marginVertical: 1,
          borderRadius: radii.iconButton,
          backgroundColor: pressed ? colors.slateSoft : "transparent",
        })}
      >
        <AppText weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          {board.name}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`أعضاء «${board.name}»: ${countLabel(board.memberCount, MEMBERS)}`}
          accessibilityHint="يعرض أسماء الأعضاء"
          hitSlop={8}
          onPress={onShowMembers}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 28,
            paddingHorizontal: 10,
            borderRadius: radii.chip,
            backgroundColor: pressed ? colors.lineStrong : colors.slateSoft,
          })}
        >
          <Ionicons name="people-outline" size={15} color={colors.slate} />
          <AppText size="caption" weight="semibold" color={colors.slate}>
            {board.memberCount}
          </AppText>
        </Pressable>
        <Ionicons name="chevron-back" size={13} color={colors.dashedStrong} />
      </Pressable>
    </View>
  );
}
