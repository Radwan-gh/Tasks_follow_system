import { Module } from "@nestjs/common";
import { BoardsModule } from "../boards/boards.module";
import { CardsController } from "./cards.controller";
import { CardsService } from "./cards.service";

@Module({
  imports: [BoardsModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
