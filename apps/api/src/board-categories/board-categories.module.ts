import { Module } from "@nestjs/common";
import { BoardCategoriesController } from "./board-categories.controller";
import { BoardCategoriesService } from "./board-categories.service";

@Module({
  controllers: [BoardCategoriesController],
  providers: [BoardCategoriesService],
  // BoardsModule validates a board's `categoryId` through this.
  exports: [BoardCategoriesService],
})
export class BoardCategoriesModule {}
