import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { json, type RequestHandler } from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { MCP_MAX_INLINE_TEXT_BYTES } from "./mcp-server.factory";
import { McpOAuthProvider } from "./oauth/oauth.provider";

/**
 * `add_attachment` can carry a text note inline in the JSON-RPC body, past
 * Nest's default 100kb JSON limit — so `/mcp` gets its own parser with room for
 * the largest note plus the envelope (non-ASCII text can grow when escaped).
 * Real files skip this path: they go to `/mcp-uploads/:token` as multipart.
 * Every other route keeps Nest's default.
 */
const parseMcpJson = json({ limit: MCP_MAX_INLINE_TEXT_BYTES * 2 });
// Not called `jsonParser`: Nest skips registering its own global JSON parser
// when a middleware by that name is already mounted (`isMiddlewareApplied`).
const mcpJsonParser: RequestHandler = (req, res, next) => parseMcpJson(req, res, next);

/**
 * Mounts the MCP SDK's Express routers, which live outside Nest's router:
 *
 * - at the root: OAuth metadata (`/.well-known/oauth-authorization-server`,
 *   `/.well-known/oauth-protected-resource/mcp`) and `/authorize`, `/token`,
 *   `/register`, `/revoke`;
 * - on `/mcp`: the bearer check, which answers an unauthenticated request with
 *   401 + `WWW-Authenticate` pointing at that metadata — the cue for Claude to
 *   start the sign-in flow — and only then the larger JSON parser, so an
 *   anonymous client can't make the API buffer a big body. `McpController`
 *   handles what gets through.
 *
 * Must run before `app.listen()`, so these sit ahead of Nest's routes.
 */
export function mountMcp(app: NestExpressApplication) {
  const provider = app.get(McpOAuthProvider);
  const { issuer, resource } = provider.urls;
  if (issuer.hostname === "localhost" && process.env.NODE_ENV === "production") {
    new Logger("MCP").warn("Set PUBLIC_API_URL: MCP OAuth is advertising a localhost issuer.");
  }

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: issuer,
      resourceServerUrl: resource,
      resourceName: "غِراس",
      // Registered clients (e.g. claude.ai) keep their secret indefinitely;
      // an expiring secret would silently break a connector after 30 days.
      clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
    }),
  );
  app.use(
    "/mcp",
    requireBearerAuth({
      verifier: provider,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resource),
      expectedResource: resource,
    }),
  );
  app.use("/mcp", mcpJsonParser);
}
