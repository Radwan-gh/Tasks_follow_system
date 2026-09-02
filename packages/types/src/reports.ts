import { z } from "zod";
import { ListStatusCategory } from "./domain";

/**
 * Response contracts for the reports section (`/reports/*`). Reports are
 * read-only aggregations gated behind the ADMIN system role, so they span
 * every board regardless of per-board membership. Defined once here and shared
 * by the API (runtime validation) and the web app (typed rendering).
 */

// --- 1) Overview: every board, with the card count of each of its lists ---

export const ReportListCountSchema = z.object({
  listId: z.string(),
  listName: z.string(),
  statusCategory: ListStatusCategory.nullable(),
  count: z.number().int(),
});
export type ReportListCount = z.infer<typeof ReportListCountSchema>;

export const ReportBoardOverviewSchema = z.object({
  boardId: z.string(),
  boardName: z.string(),
  totalCards: z.number().int(),
  lists: z.array(ReportListCountSchema),
});
export type ReportBoardOverview = z.infer<typeof ReportBoardOverviewSchema>;

export const ReportOverviewSchema = z.object({
  generatedAt: z.string().datetime(),
  boards: z.array(ReportBoardOverviewSchema),
});
export type ReportOverview = z.infer<typeof ReportOverviewSchema>;

// --- 2) Tasks completed within a time window (default: last 7 days) ---

export const CompletedTaskSchema = z.object({
  cardId: z.string(),
  cardTitle: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  listName: z.string(),
  completedAt: z.string().datetime(),
  actorName: z.string(),
});
export type CompletedTask = z.infer<typeof CompletedTaskSchema>;

export const CompletedTasksReportSchema = z.object({
  since: z.string().datetime(),
  generatedAt: z.string().datetime(),
  total: z.number().int(),
  tasks: z.array(CompletedTaskSchema),
});
export type CompletedTasksReport = z.infer<typeof CompletedTasksReportSchema>;

// --- 3a) Overdue tasks (past due, not in a DONE list, not archived) ---

export const OverdueTaskSchema = z.object({
  cardId: z.string(),
  cardTitle: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  listName: z.string(),
  dueDate: z.string().datetime(),
  assigneeNames: z.array(z.string()),
});
export type OverdueTask = z.infer<typeof OverdueTaskSchema>;

export const OverdueTasksReportSchema = z.object({
  generatedAt: z.string().datetime(),
  total: z.number().int(),
  tasks: z.array(OverdueTaskSchema),
});
export type OverdueTasksReport = z.infer<typeof OverdueTasksReportSchema>;

// --- 3b) Workload: count of open (non-archived, non-DONE) tasks per assignee ---

export const AssigneeWorkloadSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  openCards: z.number().int(),
  // A disabled user keeps their existing assignments (never silently
  // reassigned) but is flagged "يحتاج إعادة إسناد" wherever workload is shown
  // — see `design-prompt-group-3.md` §3b-6.
  isActive: z.boolean(),
});
export type AssigneeWorkload = z.infer<typeof AssigneeWorkloadSchema>;

export const WorkloadReportSchema = z.object({
  generatedAt: z.string().datetime(),
  assignees: z.array(AssigneeWorkloadSchema),
});
export type WorkloadReport = z.infer<typeof WorkloadReportSchema>;
