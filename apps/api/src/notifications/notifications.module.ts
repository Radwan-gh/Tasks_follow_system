import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { NotificationPrefsController, NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushDispatcherService } from "./push-dispatcher.service";
import { FcmService } from "./push/fcm.service";
import { PushDevicesService } from "./push/push-devices.service";
import { ScheduledJobsService } from "./scheduled-jobs.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController, NotificationPrefsController],
  providers: [NotificationsService, ScheduledJobsService, FcmService, PushDevicesService, PushDispatcherService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
