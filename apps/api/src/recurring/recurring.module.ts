import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { RecurringController } from "./recurring.controller";
import { RecurringService } from "./recurring.service";

@Module({
  imports: [BoardsModule],
  controllers: [RecurringController],
  providers: [RecurringService],
})
export class RecurringModule {}
