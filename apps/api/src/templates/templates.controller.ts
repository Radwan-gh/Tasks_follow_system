import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  CreateTemplateRequestSchema,
  UpdateTemplateRequestSchema,
  type CreateTemplateRequest,
  type UpdateTemplateRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { TemplatesService } from "./templates.service";

@ApiTags("Task Templates")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("boards/:boardId/templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: "List a board's task templates" })
  @ApiParam({ name: "boardId", description: "Board ID" })
  @ApiResponse({ status: 200, schema: zodArrayRef("Template") })
  list(@CurrentUser() user: AuthUser, @Param("boardId") boardId: string) {
    return this.templates.list(user.id, boardId);
  }

  @Post()
  @ApiOperation({ summary: "Create a task template (owner-only)" })
  @ApiParam({ name: "boardId", description: "Board ID" })
  @ApiBody({ schema: zodRef("CreateTemplateRequest") })
  @ApiResponse({ status: 201, schema: zodRef("Template") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  create(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Body(new ZodValidationPipe(CreateTemplateRequestSchema)) body: CreateTemplateRequest,
  ) {
    return this.templates.create(user.id, boardId, body);
  }

  @Patch(":templateId")
  @ApiOperation({ summary: "Rename a task template (owner-only)" })
  @ApiParam({ name: "boardId", description: "Board ID" })
  @ApiParam({ name: "templateId", description: "Template ID" })
  @ApiBody({ schema: zodRef("UpdateTemplateRequest") })
  @ApiResponse({ status: 200, schema: zodRef("Template") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  update(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Param("templateId") templateId: string,
    @Body(new ZodValidationPipe(UpdateTemplateRequestSchema)) body: UpdateTemplateRequest,
  ) {
    return this.templates.update(user.id, boardId, templateId, body);
  }

  @Delete(":templateId")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a task template (owner-only)" })
  @ApiParam({ name: "boardId", description: "Board ID" })
  @ApiParam({ name: "templateId", description: "Template ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Param("templateId") templateId: string,
  ) {
    await this.templates.remove(user.id, boardId, templateId);
  }
}
