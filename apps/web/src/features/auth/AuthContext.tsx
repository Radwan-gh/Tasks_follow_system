import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { LoginRequest, RegisterRequest } from "@app/types";
import { api } from "../../lib/api-client";
import { tokenStore } from "../../lib/token-store";

interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.getAccessToken()) {
      setIsLoading(false);
      return;
    }
    api.auth
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setIsLoading(false));
  }, []);

  async function login(input: LoginRequest) {
    const tokens = await api.auth.login(input);
    tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
    setUser(await api.auth.me());
  }

  async function register(input: RegisterRequest) {
    const tokens = await api.auth.register(input);
    tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
    setUser(await api.auth.me());
  }

  async function logout() {
    const refreshToken = tokenStore.getRefreshToken();
    if (refreshToken) await api.auth.logout(refreshToken).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
