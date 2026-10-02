import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TemplatesModule } from "../templates/templates.module";
import { AttachmentStorageService } from "../common/storage/attachment-storage.service";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { CardsController } from "./cards.controller";
import { CardsService } from "./cards.service";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";
import { UploadsController } from "./uploads.controller";

@Module({
  imports: [BoardsModule, NotificationsModule, TemplatesModule],
  controllers: [CardsController, CommentsController, AttachmentsController, UploadsController],
  providers: [CardsService, CommentsService, AttachmentsService, AttachmentStorageService],
})
export class CardsModule {}
