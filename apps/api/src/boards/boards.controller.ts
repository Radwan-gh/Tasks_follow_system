import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  AddBoardMemberRequestSchema,
  CreateBoardRequestSchema,
  UpdateBoardRequestSchema,
  type AddBoardMemberRequest,
  type CreateBoardRequest,
  type UpdateBoardRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BoardsService } from "./boards.service";

@UseGuards(JwtAuthGuard)
@Controller("boards")
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.boards.listForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateBoardRequestSchema)) body: CreateBoardRequest,
  ) {
    return this.boards.create(user.id, body);
  }

  @Get(":id")
  getDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.boards.getDetail(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateBoardRequestSchema)) body: UpdateBoardRequest,
  ) {
    return this.boards.update(user.id, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.boards.remove(user.id, id);
  }

  @Post(":id/members")
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddBoardMemberRequestSchema)) body: AddBoardMemberRequest,
  ) {
    return this.boards.addMember(user.id, id, body.email);
  }

  @Delete(":id/members/:userId")
  @HttpCode(204)
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
  ) {
    await this.boards.removeMember(user.id, id, targetUserId);
  }
}
