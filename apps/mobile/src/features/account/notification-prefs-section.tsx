import { Switch, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPrefs } from "@app/types";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { colors, radii, spacing } from "@/theme/tokens";

const TOGGLES: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: "assignmentsAndComments", label: "الإسناد والتعليقات", hint: "عند إسناد مهمة إليك أو تعليق على بطاقة تخصّك" },
  { key: "dueDatesAndOverdue", label: "المواعيد والتأخّر", hint: "قبل يوم من الموعد، وعند تأخّر مهمة عن موعدها" },
  { key: "myCardsMoved", label: "حركة بطاقاتي", hint: "عند نقل بطاقة أنشأتها إلى «انتهى»" },
];

/** "الإشعارات" section in `/account` (`design-prompt-group-3.md` §3a-2) — three switches, all on by default. */
export function NotificationPrefsSection() {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["notification-prefs"], queryFn: () => api.me.getNotificationPrefs() });

  const update = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => api.me.updateNotificationPrefs(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["notification-prefs"] });
      const previous = queryClient.getQueryData<NotificationPrefs>(["notification-prefs"]);
      if (previous) queryClient.setQueryData(["notification-prefs"], { ...previous, ...patch });
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(["notification-prefs"], context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: spacing.xl,
        gap: spacing.lg,
      }}
    >
      <AppText weight="bold">الإشعارات</AppText>

      {prefs.isPending ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={20} />
          <Skeleton height={20} />
          <Skeleton height={20} />
        </View>
      ) : (
        TOGGLES.map((toggle) => (
          <View key={toggle.key} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="semibold" size="small">
                {toggle.label}
              </AppText>
              <AppText size="caption" color={colors.muted}>
                {toggle.hint}
              </AppText>
            </View>
            <Switch
              value={prefs.data?.[toggle.key] ?? true}
              onValueChange={(value) => update.mutate({ [toggle.key]: value })}
              trackColor={{ true: colors.accent, false: colors.line }}
            />
          </View>
        ))
      )}
    </View>
  );
}
