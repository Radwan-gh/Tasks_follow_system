import { Body, Controller, Delete, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  CreateListRequestSchema,
  UpdateListRequestSchema,
  type CreateListRequest,
  type UpdateListRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodRef } from "../swagger/zod-ref";
import { ListsService } from "./lists.service";

@ApiTags("Lists")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Post("boards/:boardId/lists")
  @ApiOperation({ summary: "Create a list on a board" })
  @ApiParam({ name: "boardId", description: "Board ID" })
  @ApiBody({ schema: zodRef("CreateListRequest") })
  @ApiResponse({ status: 201, schema: zodRef("List") })
  create(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Body(new ZodValidationPipe(CreateListRequestSchema)) body: CreateListRequest,
  ) {
    return this.lists.create(user.id, boardId, body);
  }

  @Patch("lists/:id")
  @ApiOperation({ summary: "Rename, archive, or reorder a list" })
  @ApiParam({ name: "id", description: "List ID" })
  @ApiBody({ schema: zodRef("UpdateListRequest") })
  @ApiResponse({ status: 200, schema: zodRef("List") })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateListRequestSchema)) body: UpdateListRequest,
  ) {
    return this.lists.update(user.id, id, body);
  }

  @Delete("lists/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a list" })
  @ApiParam({ name: "id", description: "List ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.lists.remove(user.id, id);
  }
}
