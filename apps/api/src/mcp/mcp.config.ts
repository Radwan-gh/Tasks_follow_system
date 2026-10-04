import type { ConfigService } from "@nestjs/config";

/**
 * The public URLs the MCP OAuth flow advertises — they must be the address
 * clients actually reach. `PUBLIC_API_URL` wins if set; on Railway the
 * `RAILWAY_PUBLIC_DOMAIN` it injects is used otherwise; locally it falls back to
 * `http://localhost:<PORT>`, the one non-https issuer the MCP SDK accepts.
 *
 * - `issuer`: the OAuth authorization server (this API's root).
 * - `resource`: the MCP endpoint itself — also the `aud` of every MCP access
 *   token, which is what keeps those tokens off the REST API.
 */
export function mcpUrls(config: ConfigService) {
  const railwayDomain = config.get<string>("RAILWAY_PUBLIC_DOMAIN");
  const base =
    config.get<string>("PUBLIC_API_URL") ??
    (railwayDomain ? `https://${railwayDomain}` : `http://localhost:${config.get<string>("PORT") ?? 3000}`);
  const issuer = new URL(base.replace(/\/+$/, "") + "/");
  const resource = new URL("mcp", issuer);
  return { issuer, resource };
}
