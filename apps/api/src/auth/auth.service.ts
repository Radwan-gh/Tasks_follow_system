import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse, CurrentUser, LoginRequest, UpdateProfileRequest } from "@app/types";
import * as bcrypt from "bcrypt";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../common/util/password.util";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Fallbacks when the environment does not set the refresh-token TTLs. */
const DEFAULT_REFRESH_TTL = "30d";
const DEFAULT_SHORT_REFRESH_TTL = "12h";

function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 30 * 24 * 60 * 60 * 1000;
  const unitMs: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * unitMs[match[2]];
}

interface RefreshPayload {
  sub: string;
  jti: string;
}

/** The `GET /auth/me` / `PATCH /auth/me` response shape (`CurrentUser` in `packages/types`). */
function serializeCurrentUser(user: {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  canSendNotifications: boolean;
  createdAt: Date;
}): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role as CurrentUser["role"],
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    canSendNotifications: user.canSendNotifications,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(input: LoginRequest): Promise<AuthResponse> {
    // Usernames are stored lowercase, so sign-in is case-insensitive.
    const user = await this.prisma.user.findUnique({
      where: { username: input.username.trim().toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!user.isActive) throw new ForbiddenException("Account is deactivated");
    // "تذكرني": unchecked keeps the session short-lived. Omitted (mobile, older
    // web builds) means remembered, so nothing that worked before gets shorter.
    return this.issueTokens(user, input.rememberMe !== false);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!stored || stored.tokenHash !== hashToken(refreshToken) || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException("Invalid refresh token");
    // Role/deactivation changes propagate here: every refresh re-reads the
    // user, so a stale role claim lives at most one access-token TTL.
    if (!user.isActive) throw new UnauthorizedException("Account is deactivated");

    // Rotate: revoke the used refresh token so it can't be replayed.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    // A rotation inherits the "remember me" choice made at login: an
    // unremembered session must not turn itself into a 30-day one by refreshing.
    return this.issueTokens(user, stored.remembered);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Already invalid/expired — nothing to revoke.
    }
  }

  /**
   * Self-service password change for the logged-in user. Re-authenticates with
   * the current password, then hashes and stores the new one. All of the user's
   * refresh tokens are revoked so other sessions can't outlive the change — the
   * caller's own live access token stays valid only until its short TTL.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException("Current password is incorrect");
    }

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      // Also clears a pending admin-issued reset — this is the same endpoint
      // the "عيّن كلمة مرور جديدة" screen calls to complete one.
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** `GET /auth/me` — the logged-in user, re-read from the database rather than the token. */
  async getProfile(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    return serializeCurrentUser(user);
  }

  /**
   * Self-service profile edit (`PATCH /auth/me`). Only the display name: the
   * username is the login credential of an admin-provisioned account and the
   * email is a contact field on it, so changing either stays an admin action
   * (`PATCH /admin/users/:id`). Nothing here affects authentication, so no
   * refresh token is revoked.
   */
  async updateProfile(userId: string, input: UpdateProfileRequest): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (user.displayName === input.displayName) return serializeCurrentUser(user);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { displayName: input.displayName },
    });
    return serializeCurrentUser(updated);
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  /**
   * How long the refresh token issued for this session lives. A remembered
   * session gets `JWT_REFRESH_TTL` (30 days by default); an unremembered one —
   * "تذكرني" left unchecked, typically a shared or public device — gets the much
   * shorter `JWT_REFRESH_TTL_SHORT`, so an abandoned browser stops being a way
   * back into the account within hours instead of a month.
   */
  private refreshTtl(remembered: boolean): string {
    if (remembered) return this.config.get<string>("JWT_REFRESH_TTL") ?? DEFAULT_REFRESH_TTL;
    return this.config.get<string>("JWT_REFRESH_TTL_SHORT") ?? DEFAULT_SHORT_REFRESH_TTL;
  }

  private async issueTokens(
    user: { id: string; username: string; role: string },
    remembered: boolean,
  ): Promise<AuthResponse> {
    const jti = randomUUID();
    const refreshTtl = this.refreshTtl(remembered);
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, username: user.username, role: user.role },
        {
          secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
          expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m",
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, jti },
        {
          secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
          expiresIn: refreshTtl,
        },
      ),
    ]);

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        remembered,
        expiresAt: new Date(Date.now() + ttlToMs(refreshTtl)),
      },
    });

    return { accessToken, refreshToken };
  }
}
