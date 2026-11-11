import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

// BoardsModule for `assertMembership` on a board-scoped search.
@Module({
  imports: [BoardsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
