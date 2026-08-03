import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../common/guards/admin.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ReportsService } from "./reports.service";

/**
 * Reports section. Read-only, system-wide aggregations gated behind the ADMIN
 * role (JwtAuthGuard populates request.user, then AdminGuard requires ADMIN).
 * Because it spans every board it deliberately does not go through per-board
 * `assertMembership` — access is the system-level ADMIN grant.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("overview")
  overview() {
    return this.reports.overview();
  }

  @Get("completed")
  completed(@Query("since") since?: string) {
    return this.reports.completed(since);
  }

  @Get("overdue")
  overdue() {
    return this.reports.overdue();
  }

  @Get("workload")
  workload() {
    return this.reports.workload();
  }
}
