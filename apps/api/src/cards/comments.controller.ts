import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CreateCommentRequestSchema, type CreateCommentRequest } from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { CommentsService } from "./comments.service";

@ApiTags("Card Comments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("cards/:cardId/comments")
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: "List a card's comments" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodArrayRef("Comment") })
  list(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string) {
    return this.comments.list(user.id, cardId);
  }

  @Post()
  @ApiOperation({ summary: "Add a comment to a card" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiBody({ schema: zodRef("CreateCommentRequest") })
  @ApiResponse({ status: 201, schema: zodRef("Comment") })
  create(
    @CurrentUser() user: AuthUser,
    @Param("cardId") cardId: string,
    @Body(new ZodValidationPipe(CreateCommentRequestSchema)) body: CreateCommentRequest,
  ) {
    return this.comments.create(user.id, cardId, body);
  }

  @Delete(":commentId")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove a comment" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiParam({ name: "commentId", description: "Comment ID" })
  @ApiResponse({ status: 204, description: "Removed" })
  async remove(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string, @Param("commentId") commentId: string) {
    await this.comments.remove(user.id, cardId, commentId);
  }
}
