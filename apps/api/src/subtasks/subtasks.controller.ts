import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
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
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { SubtasksService } from "./subtasks.service";

@ApiTags("Subtasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SubtasksController {
  constructor(private readonly subtasks: SubtasksService) {}

  @Get("cards/:cardId/subtasks")
  @ApiOperation({ summary: "List a card's subtasks" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodArrayRef("Subtask") })
  list(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string) {
    return this.subtasks.list(user.id, cardId);
  }

  @Post("cards/:cardId/subtasks")
  @ApiOperation({ summary: "Create a subtask on a card" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiBody({ schema: zodRef("CreateSubtaskRequest") })
  @ApiResponse({ status: 201, schema: zodRef("Subtask") })
  create(
    @CurrentUser() user: AuthUser,
    @Param("cardId") cardId: string,
    @Body(new ZodValidationPipe(CreateSubtaskRequestSchema)) body: CreateSubtaskRequest,
  ) {
    return this.subtasks.create(user.id, cardId, body);
  }

  @Patch("subtasks/:id")
  @ApiOperation({ summary: "Rename, check off, or reorder a subtask" })
  @ApiParam({ name: "id", description: "Subtask ID" })
  @ApiBody({ schema: zodRef("UpdateSubtaskRequest") })
  @ApiResponse({ status: 200, schema: zodRef("Subtask") })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateSubtaskRequestSchema)) body: UpdateSubtaskRequest,
  ) {
    return this.subtasks.update(user.id, id, body);
  }

  @Patch("subtasks/:id/assignees")
  @ApiOperation({ summary: "Replace a subtask's assignee set" })
  @ApiParam({ name: "id", description: "Subtask ID" })
  @ApiBody({ schema: zodRef("UpdateAssigneesRequest") })
  @ApiResponse({ status: 200, schema: zodRef("Subtask") })
  updateAssignees(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateAssigneesRequestSchema)) body: UpdateAssigneesRequest,
  ) {
    return this.subtasks.updateAssignees(user.id, id, body);
  }

  @Delete("subtasks/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a subtask" })
  @ApiParam({ name: "id", description: "Subtask ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.subtasks.remove(user.id, id);
  }
}
