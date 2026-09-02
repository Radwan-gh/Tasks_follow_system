import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  CreateCardRequestSchema,
  UpdateAssigneesRequestSchema,
  UpdateCardAccessRequestSchema,
  UpdateCardRequestSchema,
  type CreateCardRequest,
  type UpdateAssigneesRequest,
  type UpdateCardAccessRequest,
  type UpdateCardRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";
import { CardsService } from "./cards.service";

@ApiTags("Cards")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

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

  @Delete("cards/:id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a card" })
  @ApiParam({ name: "id", description: "Card ID" })
  @ApiResponse({ status: 204, description: "Deleted" })
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.cards.remove(user.id, id);
  }
}
