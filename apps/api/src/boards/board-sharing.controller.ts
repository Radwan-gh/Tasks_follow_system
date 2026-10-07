import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  BoardShareRequestsQuerySchema,
  CreateBoardShareRequestSchema,
  RejectBoardShareRequestSchema,
  SimilarBoardsQuerySchema,
  type BoardShareRequestsQuery,
  type CreateBoardShareRequest,
  type RejectBoardShareRequest,
  type SimilarBoardsQuery,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { BoardSharingService } from "./board-sharing.service";

/**
 * `/board-share-requests` — turning a personal board shared, and the approver
 * queue that decides it. See `docs/18-board-sharing.md`. A board created with
 * `kind: "SHARED"` files its request through `POST /boards` instead.
 */
@ApiTags("Board sharing")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("board-share-requests")
export class BoardSharingController {
  constructor(private readonly sharing: BoardSharingService) {}

  @Get("similar")
  @ApiOperation({ summary: "Shared (or pending) boards whose name resembles a proposed one" })
  @ApiQuery({ name: "name", required: true })
  @ApiQuery({ name: "excludeBoardId", required: false })
  @ApiResponse({ status: 200, schema: zodArrayRef("SimilarBoard") })
  similar(@Query(new ZodValidationPipe(SimilarBoardsQuerySchema)) query: SimilarBoardsQuery) {
    return this.sharing.similar(query);
  }

  @Get()
  @ApiOperation({ summary: "Share requests by status (pending by default), with similar boards — approvers only" })
  @ApiQuery({ name: "status", required: false, enum: ["PENDING", "APPROVED", "REJECTED"] })
  @ApiResponse({ status: 200, schema: zodArrayRef("BoardShareRequest") })
  @ApiResponse({ status: 403, description: "Requires ADMIN or canApproveBoards" })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(BoardShareRequestsQuerySchema)) query: BoardShareRequestsQuery,
  ) {
    return this.sharing.list(user.id, query.status);
  }

  @Post()
  @ApiOperation({ summary: "Ask for a personal board to become shared (board owner)" })
  @ApiBody({ schema: zodRef("CreateBoardShareRequest") })
  @ApiResponse({ status: 201, schema: zodRef("BoardSummary") })
  @ApiResponse({ status: 400, description: "The board has no description of its scope" })
  @ApiResponse({ status: 409, description: "Already shared, or a request is already waiting" })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateBoardShareRequestSchema)) body: CreateBoardShareRequest,
  ) {
    return this.sharing.request(user.id, body);
  }

  @Post(":id/approve")
  @HttpCode(204)
  @ApiOperation({ summary: "Approve a share request: the board becomes shared — approvers only" })
  @ApiParam({ name: "id", description: "Share request ID" })
  @ApiResponse({ status: 204, description: "Approved" })
  @ApiResponse({ status: 409, description: "Already decided" })
  async approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.sharing.approve(user.id, id);
  }

  @Post(":id/reject")
  @HttpCode(204)
  @ApiOperation({ summary: "Reject a share request with a reason: the board stays personal — approvers only" })
  @ApiParam({ name: "id", description: "Share request ID" })
  @ApiBody({ schema: zodRef("RejectBoardShareRequest") })
  @ApiResponse({ status: 204, description: "Rejected" })
  @ApiResponse({ status: 409, description: "Already decided" })
  async reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectBoardShareRequestSchema)) body: RejectBoardShareRequest,
  ) {
    await this.sharing.reject(user.id, id, body.reason);
  }
}
