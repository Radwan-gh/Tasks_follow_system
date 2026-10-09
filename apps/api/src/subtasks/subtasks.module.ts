import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SubtasksController } from "./subtasks.controller";
import { SubtasksService } from "./subtasks.service";

@Module({
  imports: [BoardsModule, NotificationsModule],
  controllers: [SubtasksController],
  providers: [SubtasksService],
  exports: [SubtasksService],
})
export class SubtasksModule {}
