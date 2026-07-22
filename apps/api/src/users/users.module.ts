import { Module } from "@nestjs/common";
import { UserDirectoryController } from "./user-directory.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController, UserDirectoryController],
  providers: [UsersService],
})
export class UsersModule {}
