import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { ListsController } from "./lists.controller";
import { ListsService } from "./lists.service";

@Module({
  imports: [BoardsModule],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
