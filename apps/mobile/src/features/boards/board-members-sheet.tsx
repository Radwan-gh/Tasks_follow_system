import { useRef } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { BoardSummary } from "@app/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { useAuth } from "@/features/auth/auth-context";
import { MemberAvatar } from "@/features/cards/task-fields";
import { api } from "@/lib/api";
import { MEMBERS, countLabel } from "@/lib/plural";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/**
 * «أعضاء اللوحة» — opened from the members button on a boards-list row. Reads
 * the board itself (the same `["board", id]` cache as its settings screen) for
 * the whole membership with usernames and roles; until that lands it shows
 * the names the list already carries, so the sheet never opens empty.
 */
export function BoardMembersSheet({ board: open, onClose }: { board: BoardSummary | null; onClose: () => void }) {
  const { user } = useAuth();
  // Keep the last board while the sheet slides away, so it doesn't blank mid-close.
  const last = useRef<BoardSummary | null>(null);
  if (open) last.current = open;
  const board = open ?? last.current;
  const detail = useQuery({
    queryKey: ["board", board?.id],
    queryFn: () => api.boards.get(board!.id),
    enabled: !!open,
  });

  const rows = detail.data
    ? [...detail.data.members]
        .sort((a, b) => (a.role === b.role ? 0 : a.role === "OWNER" ? -1 : 1))
        .map((m) => ({
          userId: m.userId,
          user: m.user,
          secondary: m.user.isActive ? m.user.username : "معطَّل",
          owner: m.role === "OWNER",
        }))
    : (board?.memberPreviews ?? []).map((m) => ({
        userId: m.id,
        user: m,
        secondary: null as string | null,
        owner: m.id === board?.ownerId,
      }));
  const total = detail.data?.members.length ?? board?.memberCount ?? 0;

  return (
    <BottomSheet visible={!!open} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.xs }}>
        <View style={{ gap: 2, marginBottom: spacing.sm }}>
          <AppText weight="bold" size="title" numberOfLines={1}>
            {board?.name ?? ""}
          </AppText>
          <AppText size="small" color={colors.muted}>
            {countLabel(total, MEMBERS)}
          </AppText>
        </View>

        {rows.map((member) => (
          <View
            key={member.userId}
            style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: MIN_TOUCH_TARGET + 6 }}
          >
            <MemberAvatar member={member} size={32} />
            <View style={{ flex: 1 }}>
              <AppText weight="semibold" numberOfLines={1} style={{ lineHeight: 22 }}>
                {member.userId === user?.id ? `${member.user.displayName} (أنت)` : member.user.displayName}
              </AppText>
              {member.secondary ? (
                <AppText
                  size="caption"
                  color={member.secondary === "معطَّل" ? colors.alert : colors.muted}
                  style={{ lineHeight: 18 }}
                >
                  {member.secondary}
                </AppText>
              ) : null}
            </View>
            {member.owner ? (
              <View style={{ borderRadius: radii.chip, backgroundColor: colors.accentSoft, paddingHorizontal: spacing.md, paddingVertical: 2 }}>
                <AppText size="caption" weight="medium" color={colors.accent}>
                  مالك
                </AppText>
              </View>
            ) : null}
          </View>
        ))}

        {detail.isError ? (
          <AppText size="small" color={colors.alert}>
            تعذّر تحميل كل الأعضاء. تحقّق من اتصالك ثم أعد فتح القائمة.
          </AppText>
        ) : null}
      </View>
    </BottomSheet>
  );
}
