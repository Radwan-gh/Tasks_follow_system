import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { BoardsModule } from "./boards/boards.module";
import { CardsModule } from "./cards/cards.module";
import { ListsModule } from "./lists/lists.module";
import { MyTasksModule } from "./my-tasks/my-tasks.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";
import { SettingsModule } from "./settings/settings.module";
import { SubtasksModule } from "./subtasks/subtasks.module";
import { TemplatesModule } from "./templates/templates.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    SubtasksModule,
    ReportsModule,
    MyTasksModule,
    NotificationsModule,
    UsersModule,
    TemplatesModule,
    SettingsModule,
  ],
})
export class AppModule {}
