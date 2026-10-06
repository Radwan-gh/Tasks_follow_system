import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  AddBoardMemberRequestSchema,
  CreateBoardRequestSchema,
  SearchMemberCandidatesQuerySchema,
  SetBoardMembersRequestSchema,
  UpdateBoardMemberRoleRequestSchema,
  UpdateBoardRequestSchema,
  type AddBoardMemberRequest,
  type CreateBoardRequest,
  type SearchMemberCandidatesQuery,
  type SetBoardMembersRequest,
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
  @ApiOperation({ summary: "Permanently delete an archived board" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  @ApiResponse({ status: 409, description: "Board is not archived yet" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.boards.remove(user.id, id);
  }

  @Get(":id/member-candidates")
  @ApiOperation({ summary: "Search users who can still be added to this board (owner-only)" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiQuery({ name: "search", required: false, description: "Matches username or display name, case-insensitive" })
  @ApiQuery({ name: "limit", required: false })
  @ApiResponse({ status: 200, schema: zodRef("BoardMemberCandidateList") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  memberCandidates(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(SearchMemberCandidatesQuerySchema)) query: SearchMemberCandidatesQuery,
  ) {
    return this.boards.listMemberCandidates(user.id, id, query);
  }

  @Post(":id/members")
  @ApiOperation({ summary: "Add a member to a board by user id" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiBody({ schema: zodRef("AddBoardMemberRequest") })
  @ApiResponse({ status: 201, schema: zodRef("BoardMember") })
  @ApiResponse({ status: 404, description: "No such user" })
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddBoardMemberRequestSchema)) body: AddBoardMemberRequest,
  ) {
    return this.boards.addMember(user.id, id, body.userId, body.role);
  }

  @Put(":id/members")
  @ApiOperation({ summary: "Replace the board's member set (owner-only); newcomers join as MEMBER, the owner is always kept" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiBody({ schema: zodRef("SetBoardMembersRequest") })
  @ApiResponse({ status: 200, schema: zodArrayRef("BoardMember") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  setMembers(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SetBoardMembersRequestSchema)) body: SetBoardMembersRequest,
  ) {
    return this.boards.setMembers(user.id, id, [...new Set(body.userIds)]);
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
  @ApiOperation({ summary: "Remove a member from a board (owner-only), or leave it by passing your own user id (any non-owner member)" })
  @ApiParam({ name: "id", description: "Board ID" })
  @ApiParam({ name: "userId", description: "Target user ID" })
  @ApiResponse({ status: 204, description: "Removed" })
  @ApiResponse({ status: 400, description: "The target is the board owner" })
  @ApiResponse({ status: 403, description: "Requires OWNER role to remove someone else" })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("userId") targetUserId: string,
  ) {
    await this.boards.removeMember(user.id, id, targetUserId);
  }
}
