import * as path from "node:path";
import PDFDocument from "pdfkit";
import type {
  CompletedTasksReport,
  OverdueTasksReport,
  ReportOverview,
  WorkloadReport,
} from "@app/types";

const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");
const REGULAR_FONT = path.join(FONTS_DIR, "Cairo-Regular.ttf");
const BOLD_FONT = path.join(FONTS_DIR, "Cairo-Bold.ttf");

const PAGE_MARGIN = 40;

/**
 * PDFKit draws text through `fontkit`, which — unlike PDFKit itself — *does*
 * run real Arabic complex-text shaping (GSUB init/medi/fina/isol letter
 * joining) and right-to-left reordering, automatically, given plain
 * logical-order text with `{ align: "right", features: RTL_FEATURES }`.
 * Confirmed empirically (see git history of this file for the test PDFs)
 * against every static Arabic string this builder uses — all render
 * correctly joined and ordered this way, a large improvement over manually
 * reshaping to legacy Presentation-Forms codepoints (Cairo lacks glyphs for
 * most of those — that was tried first and produced missing-glyph boxes) or
 * manually reversing characters (fights fontkit's own shaping/reordering).
 *
 * **One confirmed real bug**: a digit run *embedded inside* an
 * Arabic-triggered RTL text run gets its digit order reversed (e.g. "2026"
 * inside "تاريخ التوليد: 2026-09-03" renders as "6202-90-30" — the whole
 * mixed run, not just the Arabic part, gets reversed). Western digits *on
 * their own* (no Arabic in the same `.text()` call) are unaffected. The
 * mitigation here is structural, not cosmetic: **never pass a string mixing
 * Arabic and digits to one `.text()` call.** `rtl()` below is only ever used
 * for pure-Arabic labels; every number/date is its own separate draw, and
 * table cells route Arabic and numeric columns through separate calls that
 * never concatenate the two (see `drawLabelValue`/`drawTable`). Free-text
 * user content (board/card names, currency symbol) that happens to mix
 * Arabic and digits is a known residual risk this doesn't fully cover —
 * pdfkit has no real bidi engine, and closing that gap needs either a font
 * with full legacy presentation-forms coverage or a proper shaping library.
 */
const RTL_FEATURES: PDFKit.Mixins.OpenTypeFeatures[] = ["rtla"];

/** §3c-6 "تصدير التقارير — GET /reports/export": which admin report to render. */
export type ExportableReport = "overview" | "completed" | "overdue" | "workload";

const REPORT_TITLES: Record<ExportableReport, string> = {
  overview: "تقرير نظرة عامة",
  completed: "تقرير المهام المنجزة",
  overdue: "تقرير المهام المتأخرة",
  workload: "تقرير عبء العمل",
};

function rtl(doc: PDFKit.PDFDocument, text: string, options?: PDFKit.Mixins.TextOptions) {
  doc.text(text, { align: "right", features: RTL_FEATURES, ...options });
}

/** A pure-digit value, drawn as its own run so it's never subject to the mixed-run reversal bug above. */
function plain(doc: PDFKit.PDFDocument, text: string, options?: PDFKit.Mixins.TextOptions) {
  doc.text(text, { align: "right", ...options });
}

/** Arabic label on one line, its (numeric or date) value directly below — see the reversal-bug note above for why they're never on one line. */
function drawLabelValue(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font(REGULAR_FONT).fontSize(10).fillColor("#8B8B95");
  rtl(doc, label);
  doc.font(BOLD_FONT).fontSize(11).fillColor("#23232A");
  plain(doc, value);
  doc.moveDown(0.4);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/**
 * Right-to-left table: `columns` are given rightmost-first (reading order).
 * Each column declares whether its cell content is Arabic text (shaped +
 * reordered) or a plain value (number/date — drawn as-is, never through the
 * Arabic path, so it can't trigger the mixed-run reversal bug).
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  columns: { header: string; width: number; kind: "arabic" | "plain" }[],
  rows: string[][],
) {
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  doc.font(BOLD_FONT).fontSize(10).fillColor("#23232A");
  let x = doc.page.width - PAGE_MARGIN;
  const headerY = doc.y;
  for (const col of columns) {
    x -= col.width;
    doc.text(col.header, x, headerY, { width: col.width, align: "right", features: RTL_FEATURES });
  }
  doc.moveDown(0.5);
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + usableWidth, doc.y)
    .strokeColor("#EAE8E3")
    .stroke();
  doc.moveDown(0.3);

  doc.font(REGULAR_FONT).fontSize(9);
  for (const row of rows) {
    if (doc.y > doc.page.height - PAGE_MARGIN - 40) {
      doc.addPage();
    }
    const rowY = doc.y;
    let rx = doc.page.width - PAGE_MARGIN;
    let rowHeight = 0;
    for (let i = 0; i < columns.length; i++) {
      rx -= columns[i].width;
      const cellText = row[i] ?? "";
      const opts: PDFKit.Mixins.TextOptions = { width: columns[i].width, align: "right" };
      if (columns[i].kind === "arabic") opts.features = RTL_FEATURES;
      doc.text(cellText, rx, rowY, opts);
      rowHeight = Math.max(rowHeight, doc.heightOfString(cellText, { width: columns[i].width }));
    }
    doc.y = rowY + rowHeight + 6;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, kind: ExportableReport, generatedAt: string, currencySymbol: string) {
  doc.font(BOLD_FONT).fontSize(18).fillColor("#23232A");
  rtl(doc, REPORT_TITLES[kind]);
  doc.moveDown(0.5);
  drawLabelValue(doc, "تاريخ التوليد", formatDate(generatedAt));
  if (kind === "overview") {
    doc.font(REGULAR_FONT).fontSize(10).fillColor("#8B8B95");
    rtl(doc, "العملة");
    doc.font(BOLD_FONT).fontSize(11).fillColor("#23232A");
    // Free-text admin setting — see the mixed-run caveat in the doc comment
    // above if it ever contains digits.
    plain(doc, currencySymbol);
    doc.moveDown(0.4);
  }
  doc.fillColor("#23232A");
  doc.moveDown(0.6);
}

export function buildReportPdf(
  kind: ExportableReport,
  data: ReportOverview | CompletedTasksReport | OverdueTasksReport | WorkloadReport,
  currencySymbol: string,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: "A4" });

  drawHeader(doc, kind, data.generatedAt, currencySymbol);

  switch (kind) {
    case "overview": {
      const report = data as ReportOverview;
      drawTable(
        doc,
        [
          { header: "اللوحة", width: 200, kind: "arabic" },
          { header: "عدد المهام", width: 100, kind: "plain" },
          { header: `التكلفة هذا الشهر (${currencySymbol})`, width: 195, kind: "plain" },
        ],
        report.boards.map((b) => [b.boardName, String(b.totalCards), b.costThisMonth ?? "—"]),
      );
      break;
    }
    case "completed": {
      const report = data as CompletedTasksReport;
      drawLabelValue(doc, "المجموع · منذ", `${report.total} · ${formatDate(report.since)}`);
      drawTable(
        doc,
        [
          { header: "المهمة", width: 165, kind: "arabic" },
          { header: "اللوحة", width: 110, kind: "arabic" },
          { header: "بواسطة", width: 110, kind: "arabic" },
          { header: "التاريخ", width: 110, kind: "plain" },
        ],
        report.tasks.map((t) => [t.cardTitle, t.boardName, t.actorName, formatDate(t.completedAt)]),
      );
      break;
    }
    case "overdue": {
      const report = data as OverdueTasksReport;
      drawLabelValue(doc, "المجموع", String(report.total));
      drawTable(
        doc,
        [
          { header: "المهمة", width: 155, kind: "arabic" },
          { header: "اللوحة", width: 105, kind: "arabic" },
          { header: "الموعد", width: 105, kind: "plain" },
          { header: "المسؤولون", width: 130, kind: "arabic" },
        ],
        report.tasks.map((t) => [t.cardTitle, t.boardName, formatDate(t.dueDate), t.assigneeNames.join("، ") || "—"]),
      );
      break;
    }
    case "workload": {
      const report = data as WorkloadReport;
      drawTable(
        doc,
        [
          { header: "المستخدم", width: 165, kind: "arabic" },
          { header: "البريد الإلكتروني", width: 180, kind: "plain" },
          { header: "المهام المفتوحة", width: 90, kind: "plain" },
          { header: "الحالة", width: 60, kind: "arabic" },
        ],
        // "معطل" spelled without the shadda diacritic — a combining mark
        // renders detached from its base letter in this font/pipeline.
        report.assignees.map((a) => [a.displayName, a.email, String(a.openCards), a.isActive ? "نشط" : "معطل"]),
      );
      break;
    }
  }

  return doc;
}
