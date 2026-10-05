import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  OversightBoardsQuerySchema,
  OversightTasksQuerySchema,
  type OversightTasksFilter,
} from "@app/types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { SupervisorGuard } from "../common/guards/supervisor.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { OversightService } from "./oversight.service";

/**
 * `/oversight/*` («المتابعة») — read-only views across every board and task.
 * `JwtAuthGuard` populates request.user, then `SupervisorGuard` requires an
 * ADMIN or a user granted `canViewAllBoards`. Nothing here writes; opening a
 * board or card goes through the normal `/boards/:id` and `/cards/:id`, which
 * admit a supervisor as a read-only viewer. See `docs/16-oversight.md`.
 */
@ApiTags("Oversight")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SupervisorGuard)
@Controller("oversight")
export class OversightController {
  constructor(private readonly oversight: OversightService) {}

  @Get("boards")
  @ApiOperation({ summary: "Every board in the system, regardless of membership" })
  @ApiQuery({ name: "archived", required: false, enum: ["true", "false"] })
  @ApiResponse({ status: 200, schema: zodArrayRef("OversightBoard") })
  @ApiResponse({ status: 403, description: "Requires ADMIN or canViewAllBoards" })
  boards(@Query(new ZodValidationPipe(OversightBoardsQuerySchema)) query: { archived: boolean }) {
    return this.oversight.boardsList(query.archived);
  }

  @Get("tasks")
  @ApiOperation({ summary: "Cards across every board, filtered and cursor-paginated" })
  @ApiQuery({ name: "assigneeId", required: false })
  @ApiQuery({ name: "boardId", required: false })
  @ApiQuery({ name: "statusCategory", required: false })
  @ApiQuery({ name: "dueFrom", required: false })
  @ApiQuery({ name: "dueTo", required: false })
  @ApiQuery({ name: "overdue", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "includeCompleted", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiResponse({ status: 200, schema: zodRef("OversightTasksResponse") })
  @ApiResponse({ status: 403, description: "Requires ADMIN or canViewAllBoards" })
  tasks(@Query(new ZodValidationPipe(OversightTasksQuerySchema)) query: OversightTasksFilter) {
    return this.oversight.tasks(query);
  }

  @Get("users")
  @ApiOperation({ summary: "Every user, for the tasks view's assignee filter" })
  @ApiResponse({ status: 200, schema: zodArrayRef("OversightUser") })
  @ApiResponse({ status: 403, description: "Requires ADMIN or canViewAllBoards" })
  users() {
    return this.oversight.users();
  }
}
