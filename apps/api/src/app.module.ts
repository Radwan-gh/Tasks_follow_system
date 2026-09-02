import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { AuthModule } from "./auth/auth.module";
import { BoardsModule } from "./boards/boards.module";
import { CardsModule } from "./cards/cards.module";
import { UPLOADS_DIR } from "./common/util/uploads.util";
import { ListsModule } from "./lists/lists.module";
import { MyTasksModule } from "./my-tasks/my-tasks.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";
import { SubtasksModule } from "./subtasks/subtasks.module";
import { UpdatesModule } from "./updates/updates.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Card image attachments (`design-prompt-group-3.md` §3a-4) — served
    // publicly from unguessable UUID filenames, no cloud storage assumed.
    ServeStaticModule.forRoot({ rootPath: UPLOADS_DIR, serveRoot: "/uploads" }),
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
    UpdatesModule,
  ],
})
export class AppModule {}
