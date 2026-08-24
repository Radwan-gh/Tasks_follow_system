import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CurrentUser, LoginRequest } from "@app/types";
import { api } from "@/lib/api";
import { tokenStorage } from "@/lib/token-storage";

interface AuthContextValue {
  user: CurrentUser | null;
  /** True until the stored session has been checked on launch. */
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Drops the session locally, without calling the API. Used when the client
   *  reports the refresh token is dead — there is nothing left to revoke. */
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mirrors `apps/web/src/features/auth/AuthContext.tsx`, with one difference:
 * `tokenStorage` is async here (SecureStore), so the launch check awaits it
 * instead of reading synchronously.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!(await tokenStorage.getAccessToken())) return;
        const me = await api.auth.me();
        if (!cancelled) setUser(me);
      } catch {
        await tokenStorage.clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginRequest) => {
    const tokens = await api.auth.login(input);
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
    setUser(await api.auth.me());
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) await api.auth.logout(refreshToken).catch(() => undefined);
    await tokenStorage.clear();
    setUser(null);
  }, []);

  const clearSession = useCallback(() => setUser(null), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
