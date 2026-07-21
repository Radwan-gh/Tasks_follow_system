import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CreateCardRequestSchema,
  CreateChecklistItemRequestSchema,
  UpdateCardRequestSchema,
  UpdateChecklistItemRequestSchema,
  type CreateCardRequest,
  type CreateChecklistItemRequest,
  type UpdateCardRequest,
  type UpdateChecklistItemRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CardsService } from "./cards.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post("lists/:listId/cards")
  create(
    @CurrentUser() user: AuthUser,
    @Param("listId") listId: string,
    @Body(new ZodValidationPipe(CreateCardRequestSchema)) body: CreateCardRequest,
  ) {
    return this.cards.create(user.id, listId, body);
  }

  @Get("cards/:id")
  getDetail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.getDetail(user.id, id);
  }

  @Get("cards/:id/history")
  getHistory(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.getHistory(user.id, id);
  }

  @Patch("cards/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateCardRequestSchema)) body: UpdateCardRequest,
  ) {
    return this.cards.update(user.id, id, body);
  }

  @Delete("cards/:id")
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.cards.remove(user.id, id);
  }

  @Get("cards/:id/checklist")
  listChecklist(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.cards.listChecklist(user.id, id);
  }

  @Post("cards/:id/checklist")
  addChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CreateChecklistItemRequestSchema)) body: CreateChecklistItemRequest,
  ) {
    return this.cards.addChecklistItem(user.id, id, body);
  }

  @Patch("checklist-items/:itemId")
  updateChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(UpdateChecklistItemRequestSchema)) body: UpdateChecklistItemRequest,
  ) {
    return this.cards.updateChecklistItem(user.id, itemId, body);
  }

  @Delete("checklist-items/:itemId")
  @HttpCode(204)
  async removeChecklistItem(@CurrentUser() user: AuthUser, @Param("itemId") itemId: string) {
    await this.cards.removeChecklistItem(user.id, itemId);
  }
}
