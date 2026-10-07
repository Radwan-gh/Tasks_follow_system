import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { BoardCategoriesModule } from "../board-categories/board-categories.module";
import { BoardsModule } from "../boards/boards.module";
import { CardsModule } from "../cards/cards.module";
import { MyTasksModule } from "../my-tasks/my-tasks.module";
import { OversightModule } from "../oversight/oversight.module";
import { SubtasksModule } from "../subtasks/subtasks.module";
import { McpController } from "./mcp.controller";
import { McpServerFactory } from "./mcp-server.factory";
import { OAuthLoginController } from "./oauth/oauth-login.controller";
import { McpOAuthProvider } from "./oauth/oauth.provider";
import { McpUploadsController, UploadLinkGuard } from "./uploads/mcp-uploads.controller";
import { UploadLinkService } from "./uploads/upload-link.service";

/**
 * The remote MCP server (docs/15-mcp-server.md): `/mcp` plus the OAuth
 * endpoints Claude signs users in through, and `/mcp-uploads/:token` for files
 * too big to travel inside a tool call. No `ListsModule` — lists can't be
 * created or changed over MCP. The SDK's Express routers are mounted outside
 * Nest's router by `mountMcp` (mount.ts), called from `main.ts`.
 */
@Module({
  imports: [AuthModule, JwtModule.register({}), BoardsModule, BoardCategoriesModule, CardsModule, SubtasksModule, MyTasksModule, OversightModule],
  controllers: [McpController, OAuthLoginController, McpUploadsController],
  providers: [McpOAuthProvider, McpServerFactory, UploadLinkService, UploadLinkGuard],
})
export class McpModule {}
