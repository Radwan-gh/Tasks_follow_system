import { Controller, Delete, Get, Post, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { McpServerFactory } from "./mcp-server.factory";

/**
 * `POST /mcp` — the Streamable HTTP MCP endpoint (docs/15-mcp-server.md).
 * `requireBearerAuth` (mounted in `mountMcp`) has already verified the token
 * and set `req.auth` before Nest routes here.
 *
 * Stateless: every request gets its own server + transport bound to the
 * caller, so there is no session store and any API instance can answer.
 */
@ApiExcludeController()
@Controller("mcp")
export class McpController {
  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(@Req() req: Request & { auth?: AuthInfo }, @Res() res: Response) {
    const userId = req.auth?.extra?.userId;
    if (typeof userId !== "string") {
      res.status(401).json({ error: "invalid_token" });
      return;
    }

    const server = this.factory.create(userId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** No server-initiated stream or session to end in stateless mode. */
  @Get()
  @Delete()
  methodNotAllowed(@Res() res: Response) {
    res
      .status(405)
      .setHeader("Allow", "POST")
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  }
}
