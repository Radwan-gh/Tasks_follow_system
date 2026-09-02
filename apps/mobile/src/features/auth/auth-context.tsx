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
  /**
   * Completes the "عيّن كلمة مرور جديدة" forced-reset screen
   * (`design-prompt-group-3.md` §3a-7). Reuses the just-entered login
   * password as `currentPassword` for `POST /auth/change-password` — the
   * design's screen only asks for the new password twice, not the temporary
   * one again, since the user typed it seconds ago to sign in.
   */
  completePasswordReset: (newPassword: string) => Promise<void>;
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
  // Held only in memory, only while `user.mustChangePassword` is true — never
  // persisted to `tokenStorage`, cleared as soon as the reset completes.
  const [pendingReauthPassword, setPendingReauthPassword] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!(await tokenStorage.getAccessToken())) return;
        const me = await api.auth.me();
        // The temporary password only ever lives in memory (`login`'s
        // `pendingReauthPassword`) — a relaunch with `mustChangePassword`
        // still set has no way to complete the reset, so fall back to a
        // fresh login instead of stranding the user on a dead-end screen.
        if (me.mustChangePassword) {
          await tokenStorage.clear();
          return;
        }
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
    const me = await api.auth.me();
    setPendingReauthPassword(me.mustChangePassword ? input.password : null);
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) await api.auth.logout(refreshToken).catch(() => undefined);
    await tokenStorage.clear();
    setPendingReauthPassword(null);
    setUser(null);
  }, []);

  const clearSession = useCallback(() => {
    setPendingReauthPassword(null);
    setUser(null);
  }, []);

  const completePasswordReset = useCallback(
    async (newPassword: string) => {
      if (!pendingReauthPassword) throw new Error("No pending password reset");
      await api.auth.changePassword({ currentPassword: pendingReauthPassword, newPassword });
      setPendingReauthPassword(null);
      setUser(await api.auth.me());
    },
    [pendingReauthPassword],
  );

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, clearSession, completePasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
