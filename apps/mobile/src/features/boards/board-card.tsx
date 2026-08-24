import { Pressable, View } from "react-native";
import type { BoardSummary } from "@app/types";
import { AppText } from "@/components/text";
import { colors, radii, spacing } from "@/theme/tokens";

/**
 * One row in the boards list.
 *
 * The design's card also carries a segmented progress bar, member avatars and
 * an «n مهمة · m مكتملة» counter. Those need `memberCount`/`cardCount`/
 * `doneCount` on `GET /boards`, which the API does not return yet — they arrive
 * with Feature 6 rather than being faked here.
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
        gap: spacing.sm,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <AppText size="title" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
          {board.name}
        </AppText>
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

      {board.description ? (
        <AppText size="small" color={colors.muted} numberOfLines={2}>
          {board.description}
        </AppText>
      ) : null}
    </Pressable>
  );
}
