import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  CreateBoardCategoryRequestSchema,
  UpdateBoardCategoryRequestSchema,
  type CreateBoardCategoryRequest,
  type UpdateBoardCategoryRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { BoardCategoriesService } from "./board-categories.service";

@ApiTags("Board categories")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("board-categories")
export class BoardCategoriesController {
  constructor(private readonly categories: BoardCategoriesService) {}

  @Get()
  @ApiOperation({ summary: "List every board category, by name" })
  @ApiResponse({ status: 200, schema: zodArrayRef("BoardCategory") })
  list() {
    return this.categories.list();
  }

  @Post()
  @ApiOperation({ summary: "Create a board category — admin-only" })
  @ApiBody({ schema: zodRef("CreateBoardCategoryRequest") })
  @ApiResponse({ status: 201, schema: zodRef("BoardCategory") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  @ApiResponse({ status: 409, description: "A category with this name already exists" })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateBoardCategoryRequestSchema)) body: CreateBoardCategoryRequest,
  ) {
    return this.categories.create(user.id, body.name);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Rename a board category — admin-only" })
  @ApiParam({ name: "id", description: "Category ID" })
  @ApiBody({ schema: zodRef("UpdateBoardCategoryRequest") })
  @ApiResponse({ status: 200, schema: zodRef("BoardCategory") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  @ApiResponse({ status: 409, description: "A category with this name already exists" })
  rename(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateBoardCategoryRequestSchema)) body: UpdateBoardCategoryRequest,
  ) {
    return this.categories.rename(user.id, id, body.name);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a board category; its boards become uncategorised — admin-only" })
  @ApiParam({ name: "id", description: "Category ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.categories.remove(user.id, id);
  }
}
