import { Body, Controller, Delete, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CreateListRequestSchema,
  UpdateListRequestSchema,
  type CreateListRequest,
  type UpdateListRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ListsService } from "./lists.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Post("boards/:boardId/lists")
  create(
    @CurrentUser() user: AuthUser,
    @Param("boardId") boardId: string,
    @Body(new ZodValidationPipe(CreateListRequestSchema)) body: CreateListRequest,
  ) {
    return this.lists.create(user.id, boardId, body);
  }

  @Patch("lists/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateListRequestSchema)) body: UpdateListRequest,
  ) {
    return this.lists.update(user.id, id, body);
  }

  @Delete("lists/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.lists.remove(user.id, id);
  }
}
