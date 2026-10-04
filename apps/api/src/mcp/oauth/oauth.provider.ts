import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Response } from "express";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { AuthService } from "../../auth/auth.service";
import { PrismaService } from "../../prisma/prisma.service";
import { mcpUrls } from "../mcp.config";
import { renderLoginPage } from "./login-page";

/** How long the login page stays valid, and how long a code waits to be exchanged. */
const LOGIN_REQUEST_TTL = "15m";
const AUTHORIZATION_CODE_TTL_MS = 5 * 60_000;

export const OAUTH_LOGIN_PATH = "/oauth/login";

/**
 * The authorization request the SDK validated in `/authorize`, carried through
 * the login form as a signed token so the form can't be edited to point the
 * code at a different client or redirect URI.
 */
export interface PendingAuthorization {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
}

interface McpAccessPayload {
  sub: string;
  client_id?: string;
  exp: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The OAuth 2.1 authorization server behind `/mcp` (docs/15-mcp-server.md):
 * dynamic client registration, the login page, PKCE-checked code exchange and
 * refresh — mounted by the SDK's `mcpAuthRouter` in `mountMcp`. Tokens are the
 * API's own JWTs, issued through `AuthService` with an MCP audience, so
 * rotation, revocation and deactivation behave exactly as they do for the apps.
 */
@Injectable()
export class McpOAuthProvider implements OAuthServerProvider {
  readonly urls: ReturnType<typeof mcpUrls>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.urls = mcpUrls(config);
  }

  readonly clientsStore: OAuthRegisteredClientsStore = {
    getClient: async (clientId) => {
      const row = await this.prisma.oAuthClient.findUnique({ where: { id: clientId } });
      if (!row) return undefined;
      return {
        ...(row.metadata as unknown as OAuthClientInformationFull),
        client_id: row.id,
        client_secret: row.clientSecret ?? undefined,
      };
    },
    registerClient: async (client) => {
      // The SDK generates `client_id` before calling us, despite the `Omit` in
      // the interface's type.
      const full = client as OAuthClientInformationFull;
      const { client_secret, ...metadata } = full;
      await this.prisma.oAuthClient.create({
        data: {
          id: full.client_id,
          clientSecret: client_secret ?? null,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });
      return full;
    },
  };

  /** `GET /authorize` (after the SDK validated client + redirect URI): show the login page. */
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (params.resource && !this.isOurResource(params.resource)) {
      throw new InvalidTargetError("Unknown resource");
    }
    const pending: PendingAuthorization = {
      clientId: client.client_id,
      clientName: client.client_name ?? "Claude",
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      resource: params.resource?.href,
    };
    res
      .status(200)
      .type("html")
      .setHeader("Cache-Control", "no-store")
      .send(
        renderLoginPage({
          clientName: pending.clientName,
          requestToken: await this.signPendingAuthorization(pending),
          action: OAUTH_LOGIN_PATH,
        }),
      );
  }

  signPendingAuthorization(pending: PendingAuthorization): Promise<string> {
    return this.jwt.signAsync({ ...pending }, { secret: this.loginRequestSecret(), expiresIn: LOGIN_REQUEST_TTL });
  }

  async verifyPendingAuthorization(token: string): Promise<PendingAuthorization | null> {
    try {
      return await this.jwt.verifyAsync<PendingAuthorization>(token, { secret: this.loginRequestSecret() });
    } catch {
      return null;
    }
  }

  /**
   * Called by `OAuthLoginController` once the user signed in: store a
   * single-use code and return the redirect back to the client.
   */
  async completeAuthorization(pending: PendingAuthorization, userId: string): Promise<string> {
    const code = randomBytes(32).toString("base64url");
    await this.prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: sha256(code),
        clientId: pending.clientId,
        userId,
        redirectUri: pending.redirectUri,
        codeChallenge: pending.codeChallenge,
        resource: pending.resource ?? null,
        expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
      },
    });
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.state) redirect.searchParams.set("state", pending.state);
    return redirect.href;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    return (await this.findLiveCode(client, code)).codeChallenge;
  }

  /** `POST /token` with `grant_type=authorization_code` — the SDK has already checked PKCE. */
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const row = await this.findLiveCode(client, code);
    if (redirectUri !== undefined && redirectUri !== row.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request");
    }
    if (resource && !this.isOurResource(resource)) throw new InvalidTargetError("Unknown resource");

    // Single use, enforced atomically: of two concurrent exchanges only one
    // flips `usedAt`.
    const claimed = await this.prisma.oAuthAuthorizationCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new InvalidGrantError("Authorization code already used");

    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user?.isActive) throw new InvalidGrantError("Account is deactivated");
    const tokens = await this.auth.issueOAuthTokens(user, this.grantFor(client));
    return this.toOAuthTokens(tokens);
  }

  /** `POST /token` with `grant_type=refresh_token` — rotates, exactly like `/auth/refresh`. */
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    if (resource && !this.isOurResource(resource)) throw new InvalidTargetError("Unknown resource");
    try {
      return this.toOAuthTokens(await this.auth.refresh(refreshToken, this.grantFor(client)));
    } catch (err) {
      if (err instanceof UnauthorizedException) throw new InvalidGrantError(err.message);
      throw err;
    }
  }

  /** Bearer check for `/mcp`: our signature, unexpired, and issued *for* `/mcp`. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let payload: McpAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<McpAccessPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        audience: this.urls.resource.href,
      });
    } catch {
      throw new InvalidTokenError("Invalid or expired access token");
    }
    return {
      token,
      clientId: payload.client_id ?? "",
      scopes: [],
      expiresAt: payload.exp,
      resource: this.urls.resource,
      extra: { userId: payload.sub },
    };
  }

  /**
   * `POST /revoke`. Access tokens are short-lived stateless JWTs and simply
   * expire; a refresh token is revoked if it belongs to this client.
   */
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    let jti: string;
    try {
      ({ jti } = await this.jwt.verifyAsync<{ jti: string }>(request.token, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      }));
    } catch {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { id: jti, oauthClientId: client.client_id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findLiveCode(client: OAuthClientInformationFull, code: string) {
    const row = await this.prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: sha256(code) } });
    if (!row || row.clientId !== client.client_id || row.usedAt || row.expiresAt < new Date()) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    return row;
  }

  private grantFor(client: OAuthClientInformationFull) {
    return { clientId: client.client_id, audience: this.urls.resource.href };
  }

  private toOAuthTokens(tokens: { accessToken: string; refreshToken: string }): OAuthTokens {
    return {
      access_token: tokens.accessToken,
      token_type: "bearer",
      expires_in: this.auth.accessTokenTtlSeconds(),
      refresh_token: tokens.refreshToken,
    };
  }

  private isOurResource(resource: URL): boolean {
    const strip = (u: URL) => u.href.replace(/#.*$/, "").replace(/\/$/, "");
    return strip(resource) === strip(this.urls.resource);
  }

  /** A key distinct from both token secrets, so a login-request token is never a usable JWT elsewhere. */
  private loginRequestSecret(): string {
    return `${this.config.getOrThrow<string>("JWT_ACCESS_SECRET")}:mcp-login-request`;
  }
}
