import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@app/types";
import * as bcrypt from "bcrypt";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

const PASSWORD_HASH_ROUNDS = 12;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("Email already registered");

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash, displayName: input.displayName },
    });
    return this.issueTokens(user);
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!user.isActive) throw new ForbiddenException("Account is deactivated");
    return this.issueTokens(user);
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
    return this.issueTokens(user);
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

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private async issueTokens(user: { id: string; email: string; role: string }): Promise<AuthResponse> {
    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, email: user.email, role: user.role },
        {
          secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
          expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m",
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, jti },
        {
          secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
          expiresIn: this.config.get<string>("JWT_REFRESH_TTL") ?? "30d",
        },
      ),
    ]);

    const ttlMs = ttlToMs(this.config.get<string>("JWT_REFRESH_TTL") ?? "30d");
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return { accessToken, refreshToken };
  }
}
