import type { ListStatusCategory } from "@app/types";
import { statusDotClass } from "../boards/lib/status-colors";

/**
 * «دليل الاستخدام» — static, end-user help. Every statement here describes real
 * behaviour, so it must change with the code it describes: the statuses follow
 * `TASK_WORKFLOW_TEMPLATE` (`docs/09-list-status-templates.md`), what
 * "completed" does follows `COMPLETED_CATEGORIES` (DONE + CLOSED), and who may
 * move a card into «انتهى» follows `CardsService.update`.
 *
 * The mobile app has its own copy (`apps/mobile/src/app/guide.tsx`) because
 * some details differ per platform — keep the two in step.
 *
 * New topics go in `SECTIONS` — the contents nav is built from it.
 */
const SECTIONS = [{ id: "statuses", title: "حالات المهام" }] as const;

interface StatusEntry {
  category: ListStatusCategory;
  name: string;
  meaning: string;
  moveWhen: string;
  /** Behaviour specific to this status, beyond what all completed statuses share. */
  notes?: string[];
}

const STATUSES: StatusEntry[] = [
  {
    category: "NEW",
    name: "جديد",
    meaning: "مهمة سُجّلت ولم تُجهَّز للعمل بعد.",
    moveWhen: "كل طلب أو فكرة جديدة تبدأ هنا، حتى لو كانت تفاصيلها ناقصة.",
  },
  {
    category: "READY",
    name: "جاهز للتنفيذ",
    meaning: "المهمة واضحة ويمكن البدء بها.",
    moveWhen: "عندما تكتمل تفاصيلها ويعرف المنفّذ ما المطلوب منه.",
  },
  {
    category: "IN_PROGRESS",
    name: "قيد التنفيذ",
    meaning: "هناك من يعمل على المهمة الآن.",
    moveWhen: "عند بدء العمل عليها فعليًا.",
  },
  {
    category: "DONE",
    name: "تم التنفيذ",
    meaning: "أُنجز العمل المطلوب.",
    moveWhen: "عند الانتهاء من التنفيذ، قبل التأكّد النهائي من النتيجة.",
    notes: [
      "تُحتسب المهمة منجَزة في التقارير من أول مرة تصل فيها إلى هذا العمود. إعادتها إلى الخلف ثم نقلها إليه مجددًا لا يحسبها مرتين.",
    ],
  },
  {
    category: "CLOSED",
    name: "انتهى",
    meaning: "سُلّمت المهمة وتم التأكّد منها.",
    moveWhen: "بعد مراجعة النتيجة وتسليمها لصاحب الطلب.",
    notes: [
      "لا ينقل المهمة إلى هنا إلا مالك اللوحة أو المسؤولون عن المهمة نفسها.",
      "يعرض هذا العمود المهام التي وصلت إليه خلال آخر 30 يومًا فقط. اضغط «عرض الأقدم» أسفل العمود لرؤية البقية.",
    ],
  },
];

const OPEN_STATUSES = STATUSES.filter((s) => s.category !== "DONE" && s.category !== "CLOSED");
const COMPLETED_STATUSES = STATUSES.filter((s) => s.category === "DONE" || s.category === "CLOSED");

export function GuidePage() {
  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-line bg-surface px-6 py-4">
        <h1 className="text-lg font-semibold text-ink">دليل الاستخدام</h1>
        <p className="text-xs text-muted">شرح مختصر لطريقة العمل في غِراس.</p>
      </header>

      <div className="mx-auto flex max-w-5xl gap-10 p-6">
        <nav aria-label="محتويات الدليل" className="hidden w-44 shrink-0 lg:block">
          <div className="sticky top-6 flex flex-col gap-1">
            <span className="px-3 pb-1 text-[11px] font-bold text-muted">المحتويات</span>
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-field px-3 py-2 text-sm text-ink/80 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {section.title}
              </a>
            ))}
          </div>
        </nav>

        <main className="min-w-0 max-w-[680px] flex-1">
          <StatusesSection />
        </main>
      </div>
    </div>
  );
}

function StatusesSection() {
  return (
    <section id="statuses" aria-labelledby="statuses-title" className="scroll-mt-6">
      <h2 id="statuses-title" className="text-2xl font-bold text-ink">
        حالات المهام
      </h2>
      <p className="mt-3 text-[15px] leading-8 text-ink/80">
        تمرّ كل مهمة في اللوحة بخمس حالات، بالترتيب نفسه دائمًا. حالة المهمة هي العمود الذي توجد فيه، فلتغيير
        حالتها انقل بطاقتها إلى عمود آخر.
      </p>

      <WorkflowTrack />

      <ol className="mt-10 flex flex-col gap-8">
        {STATUSES.map((status, i) => (
          <StatusDetail key={status.category} status={status} step={i + 1} />
        ))}
      </ol>

      <CompletedNote />
      <HowToMove />

      <p className="mt-8 text-sm leading-7 text-muted">
        قد تجد في بعض اللوحات القديمة عمودًا إضافيًا مثل «بانتظار تقييم». المهام فيه تُعامَل كمهام لم تكتمل بعد.
      </p>
    </section>
  );
}

/**
 * The five statuses as one line, the way they sit on a board. The completed
 * pair is bracketed because the app treats both as "done" everywhere.
 */
function WorkflowTrack() {
  return (
    <div className="mt-8 rounded-card border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="p-2 sm:flex-[3]">
          <TrackGroup statuses={OPEN_STATUSES} />
        </div>
        <div className="flex flex-col gap-2 rounded-field bg-status-done/10 p-2 sm:flex-[2]">
          <TrackGroup statuses={COMPLETED_STATUSES} />
          <span className="px-1 text-xs font-semibold text-ink/70">تُحتسب مكتملة</span>
        </div>
      </div>
    </div>
  );
}

function TrackGroup({ statuses }: { statuses: StatusEntry[] }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      {statuses.map((status) => (
        <li key={status.category} className="sm:flex-1">
          <a
            href={`#status-${status.category}`}
            className="flex h-full items-center gap-2 rounded-field bg-canvas px-3 py-2.5 text-sm font-semibold text-ink hover:bg-line/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex-col sm:items-start sm:gap-2.5"
          >
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(status.category)}`} />
            {status.name}
          </a>
        </li>
      ))}
    </ol>
  );
}

function StatusDetail({ status, step }: { status: StatusEntry; step: number }) {
  return (
    <li id={`status-${status.category}`} className="flex scroll-mt-6 gap-4">
      <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
        <span aria-hidden className={`h-3 w-3 rounded-full ${statusDotClass(status.category)}`} />
        <span className="w-px flex-1 bg-line" aria-hidden />
      </div>
      <div className="min-w-0 pb-1">
        <h3 className="text-[17px] font-bold text-ink">
          <span className="sr-only">الحالة {step}: </span>
          {status.name}
        </h3>
        <p className="mt-1 text-[15px] leading-8 text-ink">{status.meaning}</p>
        <p className="mt-1 text-sm leading-7 text-ink/70">
          <span className="font-semibold text-ink/80">متى أنقلها إلى هنا؟ </span>
          {status.moveWhen}
        </p>
        {status.notes?.map((note) => (
          <p key={note} className="mt-2 text-sm leading-7 text-ink/70">
            {note}
          </p>
        ))}
      </div>
    </li>
  );
}

function CompletedNote() {
  return (
    <div className="mt-10 rounded-card bg-status-done/10 p-5">
      <h3 className="text-[15px] font-bold text-ink">عندما تصل المهمة إلى «تم التنفيذ» أو «انتهى»</h3>
      <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-sm leading-7 text-ink/80">
        <li>تختفي من صفحة «مهامي»، لأنها لم تعد تنتظر منك عملًا.</li>
        <li>لا يظهر موعد تسليمها باللون الأحمر حتى لو مضى تاريخه.</li>
        <li>تدخل في عدد المهام المكتملة ونسبة الإنجاز على بطاقة اللوحة.</li>
      </ul>
    </div>
  );
}

function HowToMove() {
  return (
    <div className="mt-10">
      <h3 className="text-[17px] font-bold text-ink">كيف أغيّر حالة المهمة؟</h3>
      <dl className="mt-3 flex flex-col gap-3 text-sm leading-7">
        <div>
          <dt className="font-semibold text-ink">على الويب</dt>
          <dd className="text-ink/80">اسحب البطاقة وأفلتها في عمود الحالة الجديدة.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">في تطبيق الجوال</dt>
          <dd className="text-ink/80">
            اضغط السهم «←» على البطاقة لنقلها إلى الحالة التالية، أو اضغط عليها مطوّلًا ثم اسحبها لترتيبها أو
            أفلتها على إحدى الحالات في الأعلى. وإن رفعت إصبعك دون سحب تختار أي حالة.
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">من يستطيع ذلك؟</dt>
          <dd className="text-ink/80">
            أي عضو في اللوحة يستطيع نقل المهمة بين الحالات، عدا النقل إلى «انتهى»: هذا لمالك اللوحة والمسؤولين عن
            المهمة فقط. لا يمكن نقل المهام في لوحة مؤرشفة، ولا عند الاطّلاع على لوحة من صفحة «المتابعة».
          </dd>
        </div>
      </dl>
    </div>
  );
}
