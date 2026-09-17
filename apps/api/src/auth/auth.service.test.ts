import { describe, expect, it } from "vitest";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

/**
 * These cover the "تذكرني" (remember me) rule only: which refresh-token TTL a
 * login issues, and the fact that a rotation inherits the choice instead of
 * re-deciding it. Everything else in `AuthService` talks to Prisma for real and
 * is exercised end-to-end.
 */

const PASSWORD = "correct-horse";
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

const USER = {
  id: "user-1",
  username: "radwan",
  role: "USER",
  passwordHash,
  isActive: true,
};

const CONFIG: Record<string, string> = {
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "30d",
  JWT_REFRESH_TTL_SHORT: "12h",
};

interface StoredToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  remembered: boolean;
}

/** Minimal stand-ins for the three injected dependencies. */
function buildService() {
  const created: Array<StoredToken & { refreshExpiresIn: string }> = [];
  const stored = new Map<string, StoredToken>();
  // Filled by the fake `signAsync` so a created row can record the TTL the
  // refresh token was actually signed with.
  let lastRefreshExpiresIn = "";

  const jwt = {
    signAsync: async (payload: Record<string, unknown>, opts: { expiresIn: string }) => {
      if ("jti" in payload) lastRefreshExpiresIn = opts.expiresIn;
      return `token:${JSON.stringify(payload)}`;
    },
    verifyAsync: async (token: string) => JSON.parse(token.slice("token:".length)),
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { username?: string; id?: string } }) =>
        where.username === USER.username || where.id === USER.id ? USER : null,
    },
    refreshToken: {
      create: async ({ data }: { data: StoredToken }) => {
        stored.set(data.id, { ...data, revokedAt: null });
        created.push({ ...data, refreshExpiresIn: lastRefreshExpiresIn });
        return data;
      },
      findUnique: async ({ where }: { where: { id: string } }) => stored.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<StoredToken> }) => {
        const row = { ...stored.get(where.id)!, ...data };
        stored.set(where.id, row);
        return row;
      },
    },
  };

  const config = {
    get: (key: string) => CONFIG[key],
    getOrThrow: (key: string) => CONFIG[key],
  };

  // The constructor only stores these, so structural fakes are enough.
  const service = new AuthService(prisma as never, jwt as never, config as never);
  return { service, created };
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

describe("AuthService — remember me", () => {
  it("issues a long-lived refresh token when 'تذكرني' is checked", async () => {
    const { service, created } = buildService();
    await service.login({ username: "radwan", password: PASSWORD, rememberMe: true });

    expect(created).toHaveLength(1);
    expect(created[0].refreshExpiresIn).toBe("30d");
    expect(created[0].remembered).toBe(true);
    expect(created[0].expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * DAY_MS);
  });

  it("issues a short-lived refresh token when it is unchecked", async () => {
    const { service, created } = buildService();
    await service.login({ username: "radwan", password: PASSWORD, rememberMe: false });

    expect(created[0].refreshExpiresIn).toBe("12h");
    expect(created[0].remembered).toBe(false);
    expect(created[0].expiresAt.getTime() - Date.now()).toBeLessThan(13 * HOUR_MS);
  });

  it("treats an absent rememberMe as remembered, so older clients keep their long session", async () => {
    const { service, created } = buildService();
    await service.login({ username: "radwan", password: PASSWORD });

    expect(created[0].refreshExpiresIn).toBe("30d");
    expect(created[0].remembered).toBe(true);
  });

  it("keeps a rotated token short-lived: refreshing does not upgrade an unremembered session", async () => {
    const { service, created } = buildService();
    const tokens = await service.login({ username: "radwan", password: PASSWORD, rememberMe: false });
    await service.refresh(tokens.refreshToken);

    expect(created).toHaveLength(2);
    expect(created[1].refreshExpiresIn).toBe("12h");
    expect(created[1].remembered).toBe(false);
  });
});
