import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "../common/guards/admin.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { zodRef } from "../swagger/zod-ref";
import { ReportsService } from "./reports.service";

/**
 * Reports section. Read-only, system-wide aggregations gated behind the ADMIN
 * role (JwtAuthGuard populates request.user, then AdminGuard requires ADMIN).
 * Because it spans every board it deliberately does not go through per-board
 * `assertMembership` — access is the system-level ADMIN grant.
 */
@ApiTags("Reports")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Every board with its lists' card counts" })
  @ApiResponse({ status: 200, schema: zodRef("ReportOverview") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  overview() {
    return this.reports.overview();
  }

  @Get("completed")
  @ApiOperation({ summary: "Tasks completed within a time window (default: last 7 days)" })
  @ApiQuery({ name: "since", required: false, description: "ISO date; defaults to 7 days ago" })
  @ApiResponse({ status: 200, schema: zodRef("CompletedTasksReport") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  completed(@Query("since") since?: string) {
    return this.reports.completed(since);
  }

  @Get("overdue")
  @ApiOperation({ summary: "Past-due, non-archived tasks not yet in a DONE list" })
  @ApiResponse({ status: 200, schema: zodRef("OverdueTasksReport") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  overdue() {
    return this.reports.overdue();
  }

  @Get("workload")
  @ApiOperation({ summary: "Count of open (non-archived, non-DONE) tasks per assignee" })
  @ApiResponse({ status: 200, schema: zodRef("WorkloadReport") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  workload() {
    return this.reports.workload();
  }
}
