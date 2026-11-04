import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { SettingsModule } from "../settings/settings.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [SettingsModule, BoardsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
