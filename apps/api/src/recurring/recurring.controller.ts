import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  CreateRecurringSubtaskRequestSchema,
  CreateRecurringTaskRequestSchema,
  RecurringReportQuerySchema,
  UpdateRecurringSubtaskRequestSchema,
  UpdateRecurringTaskRequestSchema,
  type CreateRecurringSubtaskRequest,
  type CreateRecurringTaskRequest,
  type RecurringReportQuery,
  type UpdateRecurringSubtaskRequest,
  type UpdateRecurringTaskRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RecurringService } from "./recurring.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get("boards/:boardId/recurring-tasks")
  list(@CurrentUser() user: AuthUser, @Param("boardId") boardId: string) {
    return this.recurring.listForBoard(user.id, boardId);
  }

  @Post("boards/:boardId/recurring-tasks")
  create(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Body(new ZodValidationPipe(CreateRecurringTaskRequestSchema)) body: CreateRecurringTaskRequest,
  ) {
    return this.recurring.create(user.id, boardId, body);
  }

  @Patch("recurring-tasks/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateRecurringTaskRequestSchema)) body: UpdateRecurringTaskRequest,
  ) {
    return this.recurring.update(user.id, id, body);
  }

  @Delete("recurring-tasks/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.recurring.remove(user.id, id);
  }

  @Post("recurring-tasks/:id/subtasks")
  addSubtask(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CreateRecurringSubtaskRequestSchema)) body: CreateRecurringSubtaskRequest,
  ) {
    return this.recurring.addSubtask(user.id, id, body);
  }

  @Patch("recurring-subtasks/:subtaskId")
  updateSubtask(
    @CurrentUser() user: AuthUser,
    @Param("subtaskId") subtaskId: string,
    @Body(new ZodValidationPipe(UpdateRecurringSubtaskRequestSchema)) body: UpdateRecurringSubtaskRequest,
  ) {
    return this.recurring.updateSubtask(user.id, subtaskId, body);
  }

  @Delete("recurring-subtasks/:subtaskId")
  removeSubtask(@CurrentUser() user: AuthUser, @Param("subtaskId") subtaskId: string) {
    return this.recurring.removeSubtask(user.id, subtaskId);
  }

  @Post("recurring-tasks/:id/generate")
  generate(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.recurring.generate(user.id, id);
  }

  @Get("boards/:boardId/recurring-report")
  report(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Query(new ZodValidationPipe(RecurringReportQuerySchema)) query: RecurringReportQuery,
  ) {
    return this.recurring.report(user.id, boardId, query);
  }
}
