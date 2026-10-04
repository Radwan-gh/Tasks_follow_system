import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { describe, expect, it } from "vitest";
import type { AuthService } from "../../auth/auth.service";
import { JwtStrategy } from "../../auth/jwt.strategy";
import type { PrismaService } from "../../prisma/prisma.service";
import { McpOAuthProvider, type PendingAuthorization } from "./oauth.provider";

const config = new ConfigService({
  JWT_ACCESS_SECRET: "test-access",
  JWT_REFRESH_SECRET: "test-refresh",
  PUBLIC_API_URL: "https://ghiras.example",
});
const jwt = new JwtService({});
const RESOURCE = "https://ghiras.example/mcp";

interface CodeRow {
  id: string;
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  expiresAt: Date;
  usedAt: Date | null;
}

/** Just enough of Prisma for the code flow, kept in memory. */
function setup() {
  const codes: CodeRow[] = [];
  const prisma = {
    oAuthAuthorizationCode: {
      create: async ({ data }: { data: Omit<CodeRow, "id" | "usedAt"> }) => {
        codes.push({ ...data, id: String(codes.length + 1), usedAt: null });
      },
      findUnique: async ({ where }: { where: { codeHash: string } }) => codes.find((c) => c.codeHash === where.codeHash) ?? null,
      updateMany: async ({ where }: { where: { id: string; usedAt: null } }) => {
        const row = codes.find((c) => c.id === where.id && c.usedAt === null);
        if (row) row.usedAt = new Date();
        return { count: row ? 1 : 0 };
      },
    },
    user: { findUnique: async () => ({ id: "u1", username: "someone", role: "USER", isActive: true }) },
  } as unknown as PrismaService;
  const issued: unknown[] = [];
  const auth = {
    issueOAuthTokens: async (_user: unknown, grant: unknown) => {
      issued.push(grant);
      return { accessToken: "a", refreshToken: "r" };
    },
    accessTokenTtlSeconds: () => 900,
  } as unknown as AuthService;
  return { provider: new McpOAuthProvider(prisma, auth, jwt, config), codes, issued };
}

const client = (id: string) => ({ client_id: id, redirect_uris: ["https://claude.ai/cb"] }) as OAuthClientInformationFull;
const pending = (clientId = "c1"): PendingAuthorization => ({
  clientId,
  clientName: "Claude",
  redirectUri: "https://claude.ai/cb",
  codeChallenge: "challenge",
  state: "s",
});

async function issueCode(provider: McpOAuthProvider, p = pending()) {
  return new URL(await provider.completeAuthorization(p, "u1")).searchParams.get("code")!;
}

describe("McpOAuthProvider authorization codes", () => {
  it("exchanges a code once, for its own client, and binds the tokens to /mcp", async () => {
    const { provider, issued } = setup();
    const code = await issueCode(provider);

    expect(await provider.challengeForAuthorizationCode(client("c1"), code)).toBe("challenge");
    await expect(provider.challengeForAuthorizationCode(client("other"), code)).rejects.toThrow("Invalid authorization code");

    const tokens = await provider.exchangeAuthorizationCode(client("c1"), code, undefined, "https://claude.ai/cb");
    expect(tokens).toMatchObject({ access_token: "a", refresh_token: "r", expires_in: 900 });
    expect(issued).toEqual([{ clientId: "c1", audience: RESOURCE }]);

    await expect(provider.exchangeAuthorizationCode(client("c1"), code)).rejects.toThrow("Invalid authorization code");
  });

  it("rejects a mismatched redirect_uri, a foreign resource and an expired code", async () => {
    const { provider, codes } = setup();
    const code = await issueCode(provider);
    await expect(provider.exchangeAuthorizationCode(client("c1"), code, undefined, "https://evil.example/cb")).rejects.toThrow(
      "redirect_uri",
    );
    await expect(
      provider.exchangeAuthorizationCode(client("c1"), code, undefined, undefined, new URL("https://other.example/mcp")),
    ).rejects.toThrow("Unknown resource");

    const stale = await issueCode(provider);
    codes[codes.length - 1].expiresAt = new Date(Date.now() - 1);
    await expect(provider.exchangeAuthorizationCode(client("c1"), stale)).rejects.toThrow("Invalid authorization code");
  });

  it("only accepts login-request tokens it signed itself", async () => {
    const { provider } = setup();
    const token = await provider.signPendingAuthorization(pending());
    expect(await provider.verifyPendingAuthorization(token)).toMatchObject(pending());
    // Signed with the access-token secret, i.e. not by the provider's login-request key.
    const forged = await jwt.signAsync(pending(), { secret: "test-access" });
    expect(await provider.verifyPendingAuthorization(forged)).toBeNull();
  });
});

describe("token audience separation", () => {
  const sign = (aud?: string) =>
    jwt.signAsync({ sub: "u1", client_id: "c1" }, { secret: "test-access", expiresIn: "5m", ...(aud ? { audience: aud } : {}) });

  it("/mcp accepts only tokens issued for /mcp", async () => {
    const { provider } = setup();
    const info = await provider.verifyAccessToken(await sign(RESOURCE));
    expect(info).toMatchObject({ clientId: "c1", extra: { userId: "u1" } });
    expect(info.resource?.href).toBe(RESOURCE);

    await expect(provider.verifyAccessToken(await sign())).rejects.toThrow();
    await expect(provider.verifyAccessToken(await sign("https://other.example/mcp"))).rejects.toThrow();
  });

  it("the REST API refuses tokens that carry an audience", async () => {
    const strategy = new JwtStrategy(config);
    await expect(strategy.validate({ sub: "u1", aud: RESOURCE })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ sub: "u1" })).resolves.toMatchObject({ id: "u1" });
  });
});
