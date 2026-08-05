import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { SubtasksController } from "./subtasks.controller";
import { SubtasksService } from "./subtasks.service";

@Module({
  imports: [BoardsModule],
  controllers: [SubtasksController],
  providers: [SubtasksService],
})
export class SubtasksModule {}
