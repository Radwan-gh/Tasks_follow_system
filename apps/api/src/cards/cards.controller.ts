import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CreateCardRequestSchema,
  UpdateCardRequestSchema,
  type CreateCardRequest,
  type UpdateCardRequest,
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
}
