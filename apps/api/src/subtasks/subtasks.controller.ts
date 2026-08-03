import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CreateSubtaskRequestSchema,
  UpdateAssigneesRequestSchema,
  UpdateSubtaskRequestSchema,
  type CreateSubtaskRequest,
  type UpdateAssigneesRequest,
  type UpdateSubtaskRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubtasksService } from "./subtasks.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class SubtasksController {
  constructor(private readonly subtasks: SubtasksService) {}

  @Get("cards/:cardId/subtasks")
  list(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string) {
    return this.subtasks.list(user.id, cardId);
  }

  @Post("cards/:cardId/subtasks")
  create(
    @CurrentUser() user: AuthUser,
    @Param("cardId") cardId: string,
    @Body(new ZodValidationPipe(CreateSubtaskRequestSchema)) body: CreateSubtaskRequest,
  ) {
    return this.subtasks.create(user.id, cardId, body);
  }

  @Patch("subtasks/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateSubtaskRequestSchema)) body: UpdateSubtaskRequest,
  ) {
    return this.subtasks.update(user.id, id, body);
  }

  @Patch("subtasks/:id/assignees")
  updateAssignees(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateAssigneesRequestSchema)) body: UpdateAssigneesRequest,
  ) {
    return this.subtasks.updateAssignees(user.id, id, body);
  }

  @Delete("subtasks/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.subtasks.remove(user.id, id);
  }
}
