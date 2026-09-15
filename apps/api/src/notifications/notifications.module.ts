import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { NotificationPrefsController, NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushDispatcherService } from "./push-dispatcher.service";
import { FcmService } from "./push/fcm.service";
import { DevicesController, PushController } from "./push/push.controller";
import { PushDevicesService } from "./push/push-devices.service";
import { PushSenderService } from "./push/push-sender.service";
import { ScheduledJobsService } from "./scheduled-jobs.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController, NotificationPrefsController, DevicesController, PushController],
  providers: [
    NotificationsService,
    ScheduledJobsService,
    FcmService,
    PushDevicesService,
    PushDispatcherService,
    PushSenderService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
