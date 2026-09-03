import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TemplatesModule } from "../templates/templates.module";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { CardsController } from "./cards.controller";
import { CardsService } from "./cards.service";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";

@Module({
  imports: [BoardsModule, NotificationsModule, TemplatesModule],
  controllers: [CardsController, CommentsController, AttachmentsController],
  providers: [CardsService, CommentsService, AttachmentsService],
})
export class CardsModule {}
