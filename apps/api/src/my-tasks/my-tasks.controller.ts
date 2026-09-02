import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { zodRef } from "../swagger/zod-ref";
import { MyTasksService } from "./my-tasks.service";

/**
 * `/my-tasks` — everything assigned to the current user, across every board.
 * Not a report: `JwtAuthGuard` only, no `AdminGuard` — any signed-in user
 * calls this for their own assignments (see `docs/10-subtasks-and-assignment.md`).
 */
@ApiTags("My Tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("my-tasks")
export class MyTasksController {
  constructor(private readonly myTasks: MyTasksService) {}

  @Get()
  @ApiOperation({ summary: "List cards and subtasks assigned to the current user, across all boards" })
  @ApiResponse({ status: 200, schema: zodRef("MyTasksResponse") })
  list(@CurrentUser() user: AuthUser) {
    return this.myTasks.list(user.id);
  }
}
