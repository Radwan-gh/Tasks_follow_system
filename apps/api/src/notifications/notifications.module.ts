import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { NotificationPrefsController, NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { ScheduledJobsService } from "./scheduled-jobs.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController, NotificationPrefsController],
  providers: [NotificationsService, ScheduledJobsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
