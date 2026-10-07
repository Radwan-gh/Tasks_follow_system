import { Module } from "@nestjs/common";
import { BoardCategoriesModule } from "../board-categories/board-categories.module";
import { AttachmentStorageService } from "../common/storage/attachment-storage.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { BoardSharingController } from "./board-sharing.controller";
import { BoardSharingService } from "./board-sharing.service";
import { BoardsController } from "./boards.controller";
import { BoardsService } from "./boards.service";

@Module({
  imports: [BoardCategoriesModule, NotificationsModule],
  controllers: [BoardsController, BoardSharingController],
  // Storage lives here (not in CardsModule) so deleting a board can clear its
  // attachment files; CardsModule imports BoardsModule and gets the same instance.
  providers: [BoardsService, BoardSharingService, AttachmentStorageService],
  exports: [BoardsService, BoardSharingService, AttachmentStorageService],
})
export class BoardsModule {}
