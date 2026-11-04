import { BadRequestException, Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { AdminGuard } from "../common/guards/admin.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { SettingsService } from "../settings/settings.service";
import { zodRef } from "../swagger/zod-ref";
import { buildReportPdf, type ExportableReport } from "./report-pdf.builder";
import { ReportsService } from "./reports.service";

const EXPORTABLE_REPORTS: ExportableReport[] = ["overview", "completed", "overdue", "workload"];

/**
 * Reports section. Read-only aggregations gated behind the ADMIN role
 * (JwtAuthGuard populates request.user, then AdminGuard requires ADMIN). The
 * ADMIN role opens the section but does not decide what it covers: each
 * report spans only the caller's own boards (and the cards they could open
 * there), or every board for a user granted `canViewAllBoards` — see
 * `ReportsService.scopeFor`.
 */
@ApiTags("Reports")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly settings: SettingsService,
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "Every board with its lists' card counts" })
  @ApiResponse({ status: 200, schema: zodRef("ReportOverview") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  overview(@CurrentUser() user: AuthUser) {
    return this.reports.overview(user.id);
  }

  @Get("completed")
  @ApiOperation({ summary: "Tasks completed within a time window (default: last 7 days)" })
  @ApiQuery({ name: "since", required: false, description: "ISO date; defaults to 7 days ago" })
  @ApiResponse({ status: 200, schema: zodRef("CompletedTasksReport") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  completed(@CurrentUser() user: AuthUser, @Query("since") since?: string) {
    return this.reports.completed(user.id, since);
  }

  @Get("overdue")
  @ApiOperation({ summary: "Past-due, non-archived tasks not yet in a DONE list" })
  @ApiResponse({ status: 200, schema: zodRef("OverdueTasksReport") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  overdue(@CurrentUser() user: AuthUser) {
    return this.reports.overdue(user.id);
  }

  @Get("workload")
  @ApiOperation({ summary: "Count of open (non-archived, non-DONE) tasks per assignee" })
  @ApiResponse({ status: 200, schema: zodRef("WorkloadReport") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  workload(@CurrentUser() user: AuthUser) {
    return this.reports.workload(user.id);
  }

  /**
   * §3c-6 "تصدير التقارير": PDF of whichever report/period the reports screen
   * currently has open — `report` picks the tab, `since` (only meaningful for
   * `completed`) the period. Streams the PDF directly rather than returning a
   * URL, since nothing is persisted server-side.
   */
  @Get("export")
  @ApiOperation({ summary: "Export a report as a PDF" })
  @ApiQuery({ name: "report", enum: EXPORTABLE_REPORTS })
  @ApiQuery({ name: "since", required: false, description: "ISO date; only used by the 'completed' report" })
  @ApiResponse({ status: 200, description: "PDF file" })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  async export(
    @CurrentUser() user: AuthUser,
    @Query("report") report: string,
    @Query("since") since: string | undefined,
    @Res() res: Response,
  ) {
    if (!EXPORTABLE_REPORTS.includes(report as ExportableReport)) {
      throw new BadRequestException(`report must be one of: ${EXPORTABLE_REPORTS.join(", ")}`);
    }
    const kind = report as ExportableReport;

    const [data, { currencySymbol }] = await Promise.all([
      kind === "overview"
        ? this.reports.overview(user.id)
        : kind === "completed"
          ? this.reports.completed(user.id, since)
          : kind === "overdue"
            ? this.reports.overdue(user.id)
            : this.reports.workload(user.id),
      this.settings.get(),
    ]);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${kind}.pdf"`,
    });
    const doc = buildReportPdf(kind, data, currencySymbol);
    doc.pipe(res);
    doc.end();
  }
}
