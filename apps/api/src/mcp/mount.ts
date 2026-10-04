import { Logger } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { McpOAuthProvider } from "./oauth/oauth.provider";

/**
 * Mounts the MCP SDK's Express routers, which live outside Nest's router:
 *
 * - at the root: OAuth metadata (`/.well-known/oauth-authorization-server`,
 *   `/.well-known/oauth-protected-resource/mcp`) and `/authorize`, `/token`,
 *   `/register`, `/revoke`;
 * - on `/mcp`: the bearer check, which answers an unauthenticated request with
 *   401 + `WWW-Authenticate` pointing at that metadata — the cue for Claude to
 *   start the sign-in flow. `McpController` handles what gets through.
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
}
