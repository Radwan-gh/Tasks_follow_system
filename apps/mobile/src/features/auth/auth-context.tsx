import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CurrentUser, LoginRequest } from "@app/types";
import { api } from "@/lib/api";
import { tokenStorage } from "@/lib/token-storage";
import { unlinkPushDevice } from "@/features/notifications/use-push-registration";

interface AuthContextValue {
  user: CurrentUser | null;
  /** True until the stored session has been checked on launch. */
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Drops the session locally, without calling the API. Used when the client
   *  reports the refresh token is dead — there is nothing left to revoke. */
  clearSession: () => void;
  /** Re-reads `GET /auth/me` into state — used after the user edits their own profile. */
  refreshUser: () => Promise<void>;
  /**
   * Completes the "عيّن كلمة مرور جديدة" forced-reset screen
   * (`design-prompt-group-3.md` §3a-7). Reuses the just-entered login
   * password as `currentPassword` for `POST /auth/change-password` — the
   * design's screen only asks for the new password twice, not the temporary
   * one again, since the user typed it seconds ago to sign in.
   */
  completePasswordReset: (newPassword: string) => Promise<void>;
  /** Voluntary change from «حسابي» — `POST /auth/change-password`, then a silent re-sign-in (see `rotateSessionAfterPasswordChange`). */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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
    // Unlink the device *before* clearing tokens — the call is authed, and
    // skipping it would leave the server pushing this user's tasks to a phone
    // that is no longer signed in as them. The FCM token itself is kept.
    await unlinkPushDevice();

    const refreshToken = await tokenStorage.getRefreshToken();
    if (refreshToken) await api.auth.logout(refreshToken).catch(() => undefined);
    await tokenStorage.clear();
    setPendingReauthPassword(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await api.auth.me());
  }, []);

  const clearSession = useCallback(() => {
    setPendingReauthPassword(null);
    setUser(null);
  }, []);

  const completePasswordReset = useCallback(
    async (newPassword: string) => {
      if (!pendingReauthPassword || !user) throw new Error("No pending password reset");
      await api.auth.changePassword({ currentPassword: pendingReauthPassword, newPassword });
      setPendingReauthPassword(null);
      await rotateSessionAfterPasswordChange(user.username, newPassword);
      setUser(await api.auth.me());
    },
    [pendingReauthPassword, user],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) throw new Error("Not signed in");
      await api.auth.changePassword({ currentPassword, newPassword });
      await rotateSessionAfterPasswordChange(user.username, newPassword);
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, clearSession, refreshUser, completePasswordReset, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * `POST /auth/change-password` revokes *every* refresh token of the user —
 * this device's included — so without this the session would silently die the
 * next time the short-lived access token expires. Signing in again with the new
 * password swaps in a fresh token pair. If that sign-in fails, the change itself
 * has still succeeded: the old session just runs out and the user logs in
 * normally, so it is not reported as a failed change.
 */
async function rotateSessionAfterPasswordChange(username: string, newPassword: string) {
  try {
    const tokens = await api.auth.login({ username, password: newPassword });
    await tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
  } catch {
    // See above — the password is already changed server-side.
  }
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
