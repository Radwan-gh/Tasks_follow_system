import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  AddBoardMemberRequestSchema,
  CreateBoardRequestSchema,
  UpdateBoardMemberRoleRequestSchema,
  UpdateBoardRequestSchema,
  type AddBoardMemberRequest,
  type CreateBoardRequest,
  type UpdateBoardMemberRoleRequest,
  type UpdateBoardRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { BoardsService } from "./boards.service";

@ApiTags("Boards")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("boards")
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  @ApiOperation({ summary: "List boards the current user is a member of" })
  @ApiResponse({ status: 200, schema: zodArrayRef("BoardSummary") })
  list(@CurrentUser() user: AuthUser) {
    return this.boards.listForUser(user.id);
  }

  @Post()
  @ApiOperation({ summary: "Create a board" })
  @ApiBody({ schema: zodRef("CreateBoardRequest") })
  @ApiResponse({ status: 201, schema: zodRef("BoardDetail") })
  @ApiResponse({ status: 400, description: "Validation error" })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateBoardRequestSchema)) body: CreateBoardRequest,
  ) {
    return this.boards.create(user.id, body);
  }

  @Get("archived")
  @ApiOperation({ summary: "List archived boards the current user is a member of" })
  @ApiResponse({ status: 200, schema: zodArrayRef("BoardSummary") })
  listArchived(@CurrentUser() user: AuthUser) {
    return this.boards.listArchivedForUser(user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a board with its lists, cards, and members" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiQuery({
    name: "closedSince",
    required: false,
    description: "ISO date; include CLOSED cards moved on/after this date",
  })
  @ApiResponse({ status: 200, schema: zodRef("BoardDetail") })
  @ApiResponse({ status: 403, description: "Not a member of this board" })
  @ApiResponse({ status: 404, description: "Board not found" })
  getDetail(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("closedSince") closedSince?: string) {
    return this.boards.getDetail(user.id, id, closedSince ? new Date(closedSince) : undefined);
  }

  @Get(":id/summary")
  @ApiOperation({ summary: "Owner-only board summary: completed/overdue/workload/cost" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiResponse({ status: 200, schema: zodRef("BoardOwnerSummary") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  getSummary(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.boards.summary(user.id, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a board's name, description, due date, or archive state" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiBody({ schema: zodRef("UpdateBoardRequest") })
  @ApiResponse({ status: 200, schema: zodRef("BoardDetail") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateBoardRequestSchema)) body: UpdateBoardRequest,
  ) {
    return this.boards.update(user.id, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a board" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.boards.remove(user.id, id);
  }

  @Post(":id/members")
  @ApiOperation({ summary: "Add a member to a board by email" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiBody({ schema: zodRef("AddBoardMemberRequest") })
  @ApiResponse({ status: 201, schema: zodRef("BoardMember") })
  @ApiResponse({ status: 404, description: "No user with this email" })
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddBoardMemberRequestSchema)) body: AddBoardMemberRequest,
  ) {
    return this.boards.addMember(user.id, id, body.email, body.role);
  }

  @Patch(":id/members/:userId/role")
  @ApiOperation({ summary: "Change an existing member's role between MEMBER and VIEWER (owner-only)" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiParam({ name: "userId", description: "Target user ID" })
  @ApiBody({ schema: zodRef("UpdateBoardMemberRoleRequest") })
  @ApiResponse({ status: 200, schema: zodRef("BoardMember") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  updateMemberRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(UpdateBoardMemberRoleRequestSchema)) body: UpdateBoardMemberRoleRequest,
  ) {
    return this.boards.updateMemberRole(user.id, id, targetUserId, body.role);
  }

  @Delete(":id/members/:userId")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a member from a board" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiParam({ name: "userId", description: "Target user ID" })
  @ApiResponse({ status: 204, description: "Removed" })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
  ) {
    await this.boards.removeMember(user.id, id, targetUserId);
  }
}
