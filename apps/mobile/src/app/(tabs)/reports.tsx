import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ExportableReport } from "@app/api-client";
import { Screen } from "@/components/screen";
import { AppText } from "@/components/text";
import { BottomSheet } from "@/components/bottom-sheet";
import { EmptyState, ErrorState } from "@/components/state-views";
import { Skeleton } from "@/components/skeleton";
import { useCurrencySymbol } from "@/lib/currency";
import { saveAndSharePdf } from "@/lib/pdf-export";
import { api } from "@/lib/api";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

const TABS: { key: ExportableReport; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "completed", label: "منجَزة" },
  { key: "overdue", label: "متأخّرة" },
  { key: "workload", label: "عبء العمل" },
];

/**
 * `/reports` — ADMIN-only (gated at the tab bar in `_layout.tsx`, and again
 * server-side by every `/reports/*` endpoint's `AdminGuard`). A minimal,
 * read-only view of the four admin reports plus §3c-6 PDF export of
 * whichever tab is open.
 */
export default function ReportsScreen() {
  const [tab, setTab] = useState<ExportableReport>("overview");
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const currencySymbol = useCurrencySymbol();

  const overview = useQuery({ queryKey: ["reports", "overview"], queryFn: () => api.reports.overview(), enabled: tab === "overview" });
  const completed = useQuery({ queryKey: ["reports", "completed"], queryFn: () => api.reports.completed(), enabled: tab === "completed" });
  const overdue = useQuery({ queryKey: ["reports", "overdue"], queryFn: () => api.reports.overdue(), enabled: tab === "overdue" });
  const workload = useQuery({ queryKey: ["reports", "workload"], queryFn: () => api.reports.workload(), enabled: tab === "workload" });

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
        }}
      >
        <AppText size="heading" weight="bold">
          التقارير
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تصدير"
          onPress={() => setExportSheetOpen(true)}
          style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="share-outline" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginBottom: spacing.md }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}
      >
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              borderRadius: 999,
              minHeight: MIN_TOUCH_TARGET - 8,
              justifyContent: "center",
              paddingHorizontal: spacing.lg,
              backgroundColor: tab === t.key ? colors.accent : colors.surface,
              borderWidth: tab === t.key ? 0 : 1,
              borderColor: colors.line,
            }}
          >
            <AppText size="small" weight={tab === t.key ? "semibold" : "regular"} color={tab === t.key ? colors.surface : colors.muted}>
              {t.label}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm }}>
        {tab === "overview" ? (
          <ReportList
            query={overview}
            emptyMessage="لا لوحات بعد."
            rows={(overview.data?.boards ?? []).map((b) => ({
              id: b.boardId,
              title: b.boardName,
              subtitle: `${b.totalCards} مهمة${b.costThisMonth ? ` · ${b.costThisMonth} ${currencySymbol}` : ""}`,
            }))}
          />
        ) : null}

        {tab === "completed" ? (
          <ReportList
            query={completed}
            emptyMessage="لا مهام منجَزة في آخر 7 أيام."
            rows={(completed.data?.tasks ?? []).map((t) => ({
              id: t.cardId,
              title: t.cardTitle,
              subtitle: `${t.boardName} · بواسطة ${t.actorName}`,
            }))}
          />
        ) : null}

        {tab === "overdue" ? (
          <ReportList
            query={overdue}
            emptyMessage="لا مهام متأخّرة. 🎉"
            rows={(overdue.data?.tasks ?? []).map((t) => ({
              id: t.cardId,
              title: t.cardTitle,
              subtitle: `${t.boardName} · ${t.assigneeNames.join("، ") || "بلا مسؤول"}`,
            }))}
          />
        ) : null}

        {tab === "workload" ? (
          <ReportList
            query={workload}
            emptyMessage="لا إسنادات مفتوحة حاليًا."
            rows={(workload.data?.assignees ?? []).map((a) => ({
              id: a.userId,
              title: a.displayName,
              subtitle: `${a.openCards} مهمة مفتوحة${!a.isActive ? " · معطَّل" : ""}`,
            }))}
          />
        ) : null}
      </ScrollView>

      <ExportSheet
        visible={exportSheetOpen}
        onClose={() => setExportSheetOpen(false)}
        report={tab}
        label={TABS.find((t) => t.key === tab)!.label}
      />
    </Screen>
  );
}

function ReportList({
  query,
  rows,
  emptyMessage,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => void };
  rows: { id: string; title: string; subtitle: string }[];
  emptyMessage: string;
}) {
  if (query.isPending) {
    return (
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={56} radius={12} />
        <Skeleton height={56} radius={12} />
        <Skeleton height={56} radius={12} />
      </View>
    );
  }
  if (query.isError) {
    return <ErrorState onRetry={query.refetch} />;
  }
  if (rows.length === 0) {
    return <EmptyState icon="stats-chart-outline" title="لا بيانات" message={emptyMessage} />;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((row) => (
        <View
          key={row.id}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radii.card,
            borderWidth: 1,
            borderColor: colors.line,
            padding: spacing.md,
          }}
        >
          <AppText weight="semibold" size="small">
            {row.title}
          </AppText>
          <AppText size="caption" color={colors.muted}>
            {row.subtitle}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** §3c-6: "تصدير PDF — تقرير {التبويب}" + زر تصدير، حالة توليد بمؤشر، ثم ورقة مشاركة النظام. */
function ExportSheet({
  visible,
  onClose,
  report,
  label,
}: {
  visible: boolean;
  onClose: () => void;
  report: ExportableReport;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "generating" | "error">("idle");

  async function doExport() {
    setState("generating");
    try {
      const blob = await api.reports.exportPdf(report);
      await saveAndSharePdf(blob, `report-${report}.pdf`);
      setState("idle");
      onClose();
    } catch {
      setState("error");
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}>
        <AppText weight="bold" size="title">
          تصدير PDF — تقرير {label}
        </AppText>

        {state === "error" ? (
          <AppText size="small" color={colors.alert}>
            تعذّر التوليد — إعادة المحاولة
          </AppText>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={state === "generating"}
          onPress={doExport}
          style={{
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: radii.field,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: spacing.sm,
          }}
        >
          {state === "generating" ? <ActivityIndicator color={colors.surface} /> : null}
          <AppText weight="semibold" color={colors.surface}>
            {state === "generating" ? "جارٍ التوليد..." : "تصدير"}
          </AppText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
