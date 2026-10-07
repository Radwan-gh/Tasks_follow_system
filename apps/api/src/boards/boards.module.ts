import { Module } from "@nestjs/common";
import { BoardCategoriesModule } from "../board-categories/board-categories.module";
import { AttachmentStorageService } from "../common/storage/attachment-storage.service";
import { BoardsController } from "./boards.controller";
import { BoardsService } from "./boards.service";

@Module({
  imports: [BoardCategoriesModule],
  controllers: [BoardsController],
  // Storage lives here (not in CardsModule) so deleting a board can clear its
  // attachment files; CardsModule imports BoardsModule and gets the same instance.
  providers: [BoardsService, AttachmentStorageService],
  exports: [BoardsService, AttachmentStorageService],
})
export class BoardsModule {}
