import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/components/bottom-sheet";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { colors, fontSizes, radii, spacing } from "@/theme/tokens";

/**
 * "ملخّص اللوحة" (`design-prompt-group-3.md` §3b-5) — owner-only, from the
 * board header's ⋯ menu. One simple screen, no tabs: منجز آخر 7 أيام،
 * المتأخّر، توزيع الأعباء (أعلى 3 + الباقي)، وتكلفة الشهر إن وُجدت.
 */
export function BoardSummarySheet({ visible, onClose, boardId }: { visible: boolean; onClose: () => void; boardId: string }) {
  const summary = useQuery({
    queryKey: ["board", boardId, "summary"],
    queryFn: () => api.boards.getSummary(boardId),
    enabled: visible,
  });

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.md }}>
        <AppText weight="bold" size="title">
          ملخّص اللوحة
        </AppText>

        {summary.isPending ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={60} radius={radii.card} />
            <Skeleton height={60} radius={radii.card} />
          </View>
        ) : summary.isError || !summary.data ? (
          <AppText size="small" color={colors.muted}>
            تعذّر تحميل الملخّص.
          </AppText>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <StatTile label="منجز آخر 7 أيام" value={String(summary.data.completedLast7Days)} />
              <StatTile
                label="متأخّرة"
                value={String(summary.data.overdueCount)}
                color={summary.data.overdueCount > 0 ? colors.alert : colors.ink}
              />
            </View>

            <View style={{ gap: spacing.sm }}>
              <AppText size="caption" weight="semibold" color={colors.muted}>
                توزيع الأعباء
              </AppText>
              {summary.data.workload.length === 0 ? (
                <AppText size="small" color={colors.muted}>
                  لا مهام مفتوحة مُسنَدة لأحد.
                </AppText>
              ) : (
                <View style={{ gap: spacing.xs }}>
                  {summary.data.workload.map((row) => (
                    <View
                      key={row.userId}
                      style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}
                    >
                      <AppText size="small">{row.displayName}</AppText>
                      <AppText size="small" color={colors.muted}>
                        {row.openCards} مهمة
                      </AppText>
                    </View>
                  ))}
                  {summary.data.workloadRestCount > 0 ? (
                    <AppText size="caption" color={colors.muted}>
                      + {summary.data.workloadRestCount} آخرين
                    </AppText>
                  ) : null}
                </View>
              )}
            </View>

            {summary.data.costThisMonth ? (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md }}>
                <AppText size="caption" weight="semibold" color={colors.muted}>
                  إجمالي تكلفة الشهر
                </AppText>
                <AppText weight="bold" size="title">
                  {summary.data.costThisMonth}
                </AppText>
              </View>
            ) : null}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, borderRadius: radii.card, padding: spacing.lg, gap: spacing.xs }}>
      <AppText size="caption" color={colors.muted}>
        {label}
      </AppText>
      <AppText weight="bold" style={{ fontSize: fontSizes.heading, color: color ?? colors.ink }}>
        {value}
      </AppText>
    </View>
  );
}
