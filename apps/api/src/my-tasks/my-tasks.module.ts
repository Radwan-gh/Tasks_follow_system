import { Module } from "@nestjs/common";
import { MyTasksController } from "./my-tasks.controller";
import { MyTasksService } from "./my-tasks.service";

// No BoardsModule import needed: `MyTasksService` uses the pure
// `canAccessCard` helper exported from `boards.service.ts`, not
// `BoardsService` itself via DI.
@Module({
  controllers: [MyTasksController],
  providers: [MyTasksService],
})
export class MyTasksModule {}
