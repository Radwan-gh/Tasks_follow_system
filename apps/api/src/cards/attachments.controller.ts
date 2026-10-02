import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Express } from "express";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from "./attachments.service";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";

// No `fileFilter`: any file type is accepted. Safety comes from how files are
// named (`buildStoredFilename`) and served (`setUploadHeaders`/signed-URL headers).
// Buffered in memory (capped at 20MB) so nothing is stored until the service has
// checked access and the per-card cap — see `AttachmentsService.create`.
const upload = FileInterceptor("file", {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

@ApiTags("Card Attachments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("cards/:cardId/attachments")
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @ApiOperation({ summary: "List a card's attachments" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiResponse({ status: 200, schema: zodArrayRef("Attachment") })
  list(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string) {
    return this.attachments.list(user.id, cardId);
  }

  @Post()
  @UseInterceptors(upload)
  @ApiOperation({ summary: "Upload a file attachment (any type, max 20MB) to a card" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  @ApiResponse({ status: 201, schema: zodRef("Attachment") })
  @ApiResponse({ status: 400, description: "Missing file or too many attachments" })
  @ApiResponse({ status: 413, description: "File too large" })
  create(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("A file is required");
    return this.attachments.create(user.id, cardId, file);
  }

  @Delete(":attachmentId")
  @HttpCode(204)
  @ApiOperation({ summary: "Remove an attachment" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiParam({ name: "attachmentId", description: "Attachment ID" })
  @ApiResponse({ status: 204, description: "Removed" })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("cardId") cardId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    await this.attachments.remove(user.id, cardId, attachmentId);
  }
}
