import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CardCycle, CardCycles } from "@app/types";
import { api } from "../../../lib/api-client";
import { CYCLES, countLabel, formatLateBy, formatLateness } from "../../../lib/lateness";

/** Rows shown before «عرض كل الدورات». */
const VISIBLE_ROWS = 5;
/** Marks in the strip — the latest cycles; older ones stay in the list. */
const STRIP_MARKS = 40;

const dayMonth = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("ar", { timeStyle: "short" });

/**
 * «الدورات» — same section as mobile's `features/cards/cycles-section.tsx`. A
 * recurring task is one card that reopens itself each time it is moved to
 * «انتهى» (docs/14-notifications-comments-attachments.md); this is its track
 * record: a strip with one mark per finished cycle (green on time, red late,
 * hollow without a due date), oldest first in reading order, then the cycles
 * themselves, newest first. Hidden on a task that neither repeats nor ever did.
 */
export function CardCyclesSection({ cardId, repeats }: { cardId: string; repeats: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cardCycles", cardId],
    queryFn: () => api.cards.cycles(cardId),
  });
  const [showAll, setShowAll] = useState(false);

  const finished = data?.cycles ?? [];
  if (!repeats && finished.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <h3 className="text-xs font-semibold text-muted">الدورات</h3>
      {isLoading ? (
        <p className="text-sm text-muted">جارٍ التحميل...</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted">تعذّر تحميل الدورات.</p>
      ) : finished.length === 0 ? (
        <p className="text-sm text-muted">
          لم تكتمل أي دورة بعد. حين تُنقل المهمة إلى «انتهى» تُسجَّل دورتها هنا، وتعود إلى «جديد» بموعدها التالي.
        </p>
      ) : (
        <>
          <Summary data={data} />
          <Strip cycles={finished} />
          <ol className="space-y-3">
            {(showAll ? finished : finished.slice(0, VISIBLE_ROWS)).map((cycle) => (
              <CycleRow key={cycle.id} cycle={cycle} />
            ))}
          </ol>
          {finished.length > VISIBLE_ROWS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm font-semibold text-accent hover:underline"
            >
              {showAll ? "عرض آخر الدورات فقط" : `عرض كل الدورات (${finished.length})`}
            </button>
          )}
        </>
      )}
    </div>
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
    <div>
      <p className="font-semibold text-ink">اكتملت {countLabel(total, CYCLES)}</p>
      {detail && <p className="text-sm text-muted">{detail}</p>}
    </div>
  );
}

function Strip({ cycles }: { cycles: CardCycle[] }) {
  // Oldest first, so it reads like the text: the newest cycle ends the strip.
  const marks = cycles.slice(0, STRIP_MARKS).reverse();
  return (
    <div
      role="img"
      aria-label={marks
        .map((c) => `الدورة ${c.number} ${formatLateness(c.lateMinutes, c.dueDateHasTime) ?? "بلا موعد"}`)
        .join("، ")}
      className="flex flex-wrap gap-[3px]"
    >
      {marks.map((cycle) => {
        const dated = cycle.lateMinutes !== null;
        const late = dated && cycle.lateMinutes! > 0;
        return (
          <span
            key={cycle.id}
            title={`الدورة ${cycle.number}: ${formatLateness(cycle.lateMinutes, cycle.dueDateHasTime) ?? "بلا موعد"}`}
            className={`h-5 w-2 rounded-[3px] ${!dated ? "border border-line" : late ? "bg-alert" : "bg-onTime"}`}
          />
        );
      })}
    </div>
  );
}

function CycleRow({ cycle }: { cycle: CardCycle }) {
  const punctuality = formatLateness(cycle.lateMinutes, cycle.dueDateHasTime);
  const late = cycle.lateMinutes !== null && cycle.lateMinutes > 0;
  const due = cycle.dueDate ? formatMoment(cycle.dueDate, cycle.dueDateHasTime) : null;
  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-ink">الدورة {cycle.number}</span>
        {punctuality && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              late ? "bg-alert-bg text-alert" : "bg-onTime-bg text-onTime"
            }`}
          >
            {punctuality}
          </span>
        )}
      </div>
      <p className="text-muted">
        أغلقها {cycle.closedBy.displayName} في {formatMoment(cycle.closedAt, true)}
        {due ? `، وموعدها ${due}` : "، ولم يكن لها موعد"}
      </p>
      {cycle.subtaskTotal > 0 && (
        <p className="text-xs text-muted">
          المهام الفرعية المنجزة: {cycle.subtaskDone} من {cycle.subtaskTotal}
        </p>
      )}
    </li>
  );
}

/** «16 أكتوبر»، with «، 2:20 م» when the time of day matters. */
function formatMoment(iso: string, withTime: boolean): string {
  const at = new Date(iso);
  return withTime ? `${dayMonth.format(at)}، ${time.format(at)}` : dayMonth.format(at);
}
