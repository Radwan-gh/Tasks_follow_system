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
import { diskStorage } from "multer";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { Express } from "express";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ALLOWED_ATTACHMENT_MIME_TYPES, AttachmentsService, MAX_ATTACHMENT_BYTES } from "./attachments.service";
import { UPLOADS_DIR } from "../common/util/uploads.util";
import { zodArrayRef, zodRef } from "../swagger/zod-ref";

const upload = FileInterceptor("file", {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype));
  },
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
  @ApiOperation({ summary: "Upload an image attachment to a card (max 5MB)" })
  @ApiParam({ name: "cardId", description: "Card ID" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", properties: { file: { type: "string", format: "binary" } } } })
  @ApiResponse({ status: 201, schema: zodRef("Attachment") })
  @ApiResponse({ status: 400, description: "Missing file, wrong type, or too large" })
  create(@CurrentUser() user: AuthUser, @Param("cardId") cardId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Images only, up to 5MB");
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
