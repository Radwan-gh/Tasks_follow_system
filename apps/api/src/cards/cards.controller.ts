import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  CreateCardRequestSchema,
  SaveCardAsTemplateRequestSchema,
  SetCardBoardsRequestSchema,
  UpdateAssigneesRequestSchema,
  UpdateCardAccessRequestSchema,
  UpdateCardRequestSchema,
  type CreateCardRequest,
  type SaveCardAsTemplateRequest,
  type SetCardBoardsRequest,
  type UpdateAssigneesRequest,
  type UpdateCardAccessRequest,
  type UpdateCardRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { TemplatesService } from "../templates/templates.service";
import { CardsService } from "./cards.service";

@ApiTags("Cards")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly templates: TemplatesService,
  ) {}

  @Post("lists/:listId/cards")
  @ApiOperation({ summary: "Create a card in a list" })
  @ApiParam({ name: "listId", description: "List ID" })
  @ApiBody({ schema: zodRef("CreateCardRequest") })
  @ApiResponse({ status: 201, schema: zodRef("Card") })
  create(
    @CurrentUser() user: AuthUser,
    @Param("listId") listId: string,
    @Body(new ZodValidationPipe(CreateCardRequestSchema)) body: CreateCardRequest,
  ) {
    return this.cards.create(user.id, listId, body);
  }

  @Get("cards/:id")
  @ApiOperation({ summary: "Get a card" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodRef("Card") })
  @ApiResponse({ status: 403, description: "Restricted card, not a permitted member" })
  @ApiResponse({ status: 404, description: "Card not found" })
  getDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.getDetail(user.id, id);
  }

  @Get("cards/:id/history")
  @ApiOperation({ summary: "Get a card's activity history" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodArrayRef("CardActivity") })
  getHistory(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.getHistory(user.id, id);
  }

  @Patch("cards/:id")
  @ApiOperation({ summary: "Update a card's fields, move it between lists, or reorder it" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiBody({ schema: zodRef("UpdateCardRequest") })
  @ApiResponse({ status: 200, schema: zodRef("Card") })
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateCardRequestSchema)) body: UpdateCardRequest,
  ) {
    return this.cards.update(user.id, id, body);
  }

  @Patch("cards/:id/access")
  @ApiOperation({ summary: "Replace a card's access restriction (restricted member allow-list)" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiBody({ schema: zodRef("UpdateCardAccessRequest") })
  @ApiResponse({ status: 200, schema: zodRef("Card") })
  updateAccess(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateCardAccessRequestSchema)) body: UpdateCardAccessRequest,
  ) {
    return this.cards.updateAccess(user.id, id, body);
  }

  @Patch("cards/:id/assignees")
  @ApiOperation({ summary: "Replace a card's assignee set" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiBody({ schema: zodRef("UpdateAssigneesRequest") })
  @ApiResponse({ status: 200, schema: zodRef("Card") })
  updateAssignees(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateAssigneesRequestSchema)) body: UpdateAssigneesRequest,
  ) {
    return this.cards.updateAssignees(user.id, id, body);
  }

  @Get("cards/:id/boards")
  @ApiOperation({ summary: "The boards a task is on, and the ones the caller may add it to" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodRef("CardBoardsResponse") })
  getBoards(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.getBoards(user.id, id);
  }

  @Put("cards/:id/boards")
  @ApiOperation({ summary: "Replace the boards a task is on (task owner or admin)" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiBody({ schema: zodRef("SetCardBoardsRequest") })
  @ApiResponse({ status: 200, schema: zodRef("CardBoardsResponse") })
  setBoards(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SetCardBoardsRequestSchema)) body: SetCardBoardsRequest,
  ) {
    return this.cards.setBoards(user.id, id, body);
  }

  @Get("cards/:id/people")
  @ApiOperation({ summary: "Everyone on any of the task's boards — its assignee and access candidates" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodArrayRef("BoardMember") })
  people(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.people(user.id, id);
  }

  @Post("cards/:id/save-as-template")
  @ApiOperation({ summary: "Save this card's title/description/subtasks as a reusable board template (owner-only)" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiBody({ schema: zodRef("SaveCardAsTemplateRequest") })
  @ApiResponse({ status: 201, schema: zodRef("Template") })
  @ApiResponse({ status: 403, description: "Requires OWNER role" })
  saveAsTemplate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SaveCardAsTemplateRequestSchema)) body: SaveCardAsTemplateRequest,
  ) {
    return this.templates.saveFromCard(user.id, id, body.name);
  }

  @Delete("cards/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a card" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.cards.remove(user.id, id);
  }
}
