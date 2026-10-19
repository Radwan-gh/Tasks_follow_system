import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { formatLateBy, formatLateness, type CardCycle, type CardCycles } from "@app/types";
import { AppText } from "@/components/text";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { formatDueDate } from "@/lib/date";
import { CYCLES, countLabel } from "@/lib/plural";
import { MIN_TOUCH_TARGET, colors, radii, spacing } from "@/theme/tokens";

/** Rows shown before «عرض كل الدورات». */
const VISIBLE_ROWS = 5;
/** Marks in the strip — the latest cycles; older ones stay in the list. */
const STRIP_MARKS = 40;

const time = new Intl.DateTimeFormat("ar", { timeStyle: "short" });

/**
 * «الدورات»: a recurring task is one card that reopens itself every time it is
 * moved to «انتهى» (docs/14-notifications-comments-attachments.md), and this is
 * its track record. A strip with one mark per finished cycle — green on time,
 * red late, hollow without a due date — reads in the same direction as the
 * text, oldest first, so a run of late cycles shows at a glance; below it, the
 * cycles themselves, newest first. Hidden on a task that neither repeats nor
 * ever did.
 */
export function CyclesSection({ cardId, repeats }: { cardId: string; repeats: boolean }) {
  const cycles = useQuery({ queryKey: ["cardCycles", cardId], queryFn: () => api.cards.cycles(cardId) });
  const [showAll, setShowAll] = useState(false);

  const finished = cycles.data?.cycles ?? [];
  if (!repeats && finished.length === 0) return null;

  return (
    <View style={{ gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.lg }}>
      <AppText size="caption" weight="semibold" color={colors.muted}>
        الدورات
      </AppText>

      {cycles.isPending ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton height={14} width="50%" />
          <Skeleton height={18} width="70%" />
        </View>
      ) : cycles.isError ? (
        <AppText size="small" color={colors.muted}>
          تعذّر تحميل الدورات.
        </AppText>
      ) : finished.length === 0 ? (
        <AppText size="small" color={colors.muted}>
          لم تكتمل أي دورة بعد. حين تُنقل المهمة إلى «انتهى» تُسجَّل دورتها هنا، وتعود إلى «جديد» بموعدها التالي.
        </AppText>
      ) : (
        <>
          <Summary data={cycles.data} />
          <Strip cycles={finished} />
          <View style={{ gap: spacing.lg, marginTop: spacing.xs }}>
            {(showAll ? finished : finished.slice(0, VISIBLE_ROWS)).map((cycle) => (
              <CycleRow key={cycle.id} cycle={cycle} />
            ))}
          </View>
          {finished.length > VISIBLE_ROWS ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAll((v) => !v)}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center" }}
            >
              <AppText size="small" weight="semibold" color={colors.accent}>
                {showAll ? "عرض آخر الدورات فقط" : `عرض كل الدورات (${finished.length})`}
              </AppText>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

function Summary({ data }: { data: CardCycles }) {
  const { total, onTime, late, averageLateMinutes } = data.summary;
  const hasTime = data.cycles.some((c) => c.dueDateHasTime);
  let detail: string | null = null;
  if (late === 0 && onTime > 0) detail = onTime === total ? "كلها في الموعد" : `في الموعد ${onTime}`;
  else if (late > 0) {
    const average = averageLateMinutes ? ` بمتوسط ${formatLateBy(averageLateMinutes, hasTime)}` : "";
    detail = `في الموعد ${onTime}، ومتأخرة ${late}${average}`;
  }
  return (
    <View style={{ gap: 2 }}>
      <AppText weight="semibold">اكتملت {countLabel(total, CYCLES)}</AppText>
      {detail ? (
        <AppText size="small" color={colors.muted}>
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}

function Strip({ cycles }: { cycles: CardCycle[] }) {
  // Oldest first, so it reads like the text: the newest cycle ends the strip.
  const marks = cycles.slice(0, STRIP_MARKS).reverse();
  return (
    <View
      accessible
      accessibilityLabel={marks.map((c) => `الدورة ${c.number} ${formatLateness(c.lateMinutes, c.dueDateHasTime) ?? "بلا موعد"}`).join("، ")}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}
    >
      {marks.map((cycle) => {
        const late = cycle.lateMinutes !== null && cycle.lateMinutes > 0;
        const dated = cycle.lateMinutes !== null;
        return (
          <View
            key={cycle.id}
            style={{
              width: 8,
              height: 20,
              borderRadius: 3,
              backgroundColor: !dated ? "transparent" : late ? colors.alert : colors.onTime,
              borderWidth: dated ? 0 : 1,
              borderColor: colors.line,
            }}
          />
        );
      })}
    </View>
  );
}

function CycleRow({ cycle }: { cycle: CardCycle }) {
  const punctuality = formatLateness(cycle.lateMinutes, cycle.dueDateHasTime);
  const late = cycle.lateMinutes !== null && cycle.lateMinutes > 0;
  const due = cycle.dueDate ? formatMoment(cycle.dueDate, cycle.dueDateHasTime) : null;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
        <AppText size="small" weight="bold">
          الدورة {cycle.number}
        </AppText>
        {punctuality ? (
          <View
            style={{
              backgroundColor: late ? colors.alertSoft : colors.onTimeSoft,
              borderRadius: radii.chip,
              paddingHorizontal: spacing.sm,
            }}
          >
            <AppText size="caption" weight="semibold" color={late ? colors.alert : colors.onTime}>
              {punctuality}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText size="small" color={colors.muted} style={{ lineHeight: 22 }}>
        أغلقها {cycle.closedBy.displayName} في {formatMoment(cycle.closedAt, true)}
        {due ? `، وموعدها ${due}` : "، ولم يكن لها موعد"}
      </AppText>
      {cycle.subtaskTotal > 0 ? (
        <AppText size="caption" color={colors.muted}>
          المهام الفرعية المنجزة: {cycle.subtaskDone} من {cycle.subtaskTotal}
        </AppText>
      ) : null}
    </View>
  );
}

/** «16 أكتوبر»، with «، 2:20 م» when the time of day matters. */
function formatMoment(iso: string, withTime: boolean): string {
  return withTime ? `${formatDueDate(iso)}، ${time.format(new Date(iso))}` : formatDueDate(iso);
}
