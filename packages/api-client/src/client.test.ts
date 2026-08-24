import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, type TokenStorage } from "./client.js";
import { ApiError } from "./error.js";

/**
 * These cover the session behaviour both apps depend on and neither can easily
 * test itself: attaching the token, refreshing once on a 401, de-duplicating
 * concurrent refreshes, and knowing when a 401 is terminal.
 *
 * `fetch` is faked rather than mocked at the network layer, so the assertions
 * are about the requests the client *makes* — which is the contract.
 */

function makeStorage(access: string | null, refresh: string | null) {
  const state = { access, refresh };
  const storage: TokenStorage = {
    getAccessToken: () => state.access,
    getRefreshToken: () => state.refresh,
    setTokens: (a, r) => {
      state.access = a;
      state.refresh = r;
    },
    clear: () => {
      state.access = null;
      state.refresh = null;
    },
  };
  return { storage, state };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

type Call = { url: string; init: RequestInit };

/** Records every request, and answers each one from `handler`. */
function fakeFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url, init };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const authHeader = (call: Call) => new Headers(call.init.headers).get("Authorization");

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("createApiClient", () => {
  it("attaches the access token as a bearer header", async () => {
    const { storage } = makeStorage("access-1", "refresh-1");
    const calls = fakeFetch(() => jsonResponse(200, { id: "u1" }));

    const api = createApiClient({ baseUrl: "https://api.test", storage });
    await api.auth.me();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.test/auth/me");
    expect(authHeader(calls[0]!)).toBe("Bearer access-1");
  });

  it("refreshes once on a 401 and retries the original request", async () => {
    const { storage, state } = makeStorage("stale", "refresh-1");
    const calls = fakeFetch((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" });
      }
      return authHeader(call) === "Bearer stale"
        ? jsonResponse(401, { message: "Unauthorized" })
        : jsonResponse(200, { id: "u1" });
    });

    const api = createApiClient({ baseUrl: "https://api.test", storage });
    await expect(api.auth.me()).resolves.toEqual({ id: "u1" });

    // original (401) → refresh → retry
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.test/auth/me",
      "https://api.test/auth/refresh",
      "https://api.test/auth/me",
    ]);
    expect(authHeader(calls[2]!)).toBe("Bearer access-2");
    expect(state).toEqual({ access: "access-2", refresh: "refresh-2" });
  });

  it("de-duplicates concurrent refreshes into a single call", async () => {
    const { storage } = makeStorage("stale", "refresh-1");
    const calls = fakeFetch((call) => {
      if (call.url.endsWith("/auth/refresh")) {
        return jsonResponse(200, { accessToken: "access-2", refreshToken: "refresh-2" });
      }
      return authHeader(call) === "Bearer stale"
        ? jsonResponse(401, { message: "Unauthorized" })
        : jsonResponse(200, { id: "u1" });
    });

    const api = createApiClient({ baseUrl: "https://api.test", storage });
    await Promise.all([api.auth.me(), api.auth.me(), api.auth.me()]);

    // Refresh tokens rotate, so a second concurrent refresh would present an
    // already-revoked token and fail. Exactly one is the whole point.
    const refreshes = calls.filter((c) => c.url.endsWith("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
  });

  it("gives up and clears the session when the refresh itself fails", async () => {
    const { storage, state } = makeStorage("stale", "dead-refresh");
    fakeFetch((call) =>
      call.url.endsWith("/auth/refresh")
        ? jsonResponse(401, { message: "Invalid refresh token" })
        : jsonResponse(401, { message: "Unauthorized" }),
    );
    const onUnauthorized = vi.fn();

    const api = createApiClient({ baseUrl: "https://api.test", storage, onUnauthorized });

    await expect(api.auth.me()).rejects.toMatchObject({ status: 401, message: "Session expired" });
    expect(state).toEqual({ access: null, refresh: null });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("treats a 401 from /auth/login as terminal, not an expired session", async () => {
    // Regression: routing a failed login through the refresh path reported
    // "Session expired" instead of the API's message, and cleared the tokens of
    // whoever was already signed in.
    const { storage, state } = makeStorage("access-1", "refresh-1");
    const calls = fakeFetch(() => jsonResponse(401, { message: "Invalid credentials" }));
    const onUnauthorized = vi.fn();

    const api = createApiClient({ baseUrl: "https://api.test", storage, onUnauthorized });

    await expect(api.auth.login({ email: "a@b.c", password: "wrong" })).rejects.toMatchObject({
      status: 401,
      message: "Invalid credentials",
    });
    expect(calls.some((c) => c.url.endsWith("/auth/refresh"))).toBe(false);
    expect(state).toEqual({ access: "access-1", refresh: "refresh-1" });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("surfaces the API's message for other failures", async () => {
    const { storage } = makeStorage("access-1", "refresh-1");
    fakeFetch(() => jsonResponse(403, { message: "You do not have access to this board" }));

    const api = createApiClient({ baseUrl: "https://api.test", storage });

    await expect(api.boards.get("b1")).rejects.toBeInstanceOf(ApiError);
    await expect(api.boards.get("b1")).rejects.toMatchObject({
      status: 403,
      message: "You do not have access to this board",
    });
  });

  it("returns undefined for a 204 instead of trying to parse a body", async () => {
    const { storage } = makeStorage("access-1", "refresh-1");
    fakeFetch(() => ({ ok: true, status: 204, json: async () => {
      throw new Error("204 responses have no body");
    } }) as unknown as Response);

    const api = createApiClient({ baseUrl: "https://api.test", storage });
    await expect(api.cards.remove("c1")).resolves.toBeUndefined();
  });
});
