import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { SupervisorGuard } from "../common/guards/supervisor.guard";
import { OversightController } from "./oversight.controller";
import { OversightService } from "./oversight.service";

@Module({
  imports: [BoardsModule],
  controllers: [OversightController],
  providers: [OversightService, SupervisorGuard],
  exports: [OversightService],
})
export class OversightModule {}
