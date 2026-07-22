import type {
  AdminUser,
  AdminUserList,
  AuthResponse,
  BoardDetail,
  BoardMember,
  BoardSummary,
  Card,
  CardActivity,
  CreateBoardRequest,
  CreateCardRequest,
  CreateListRequest,
  CurrentUser,
  List,
  LoginRequest,
  RegisterRequest,
  UpdateBoardRequest,
  UpdateCardAccessRequest,
  UpdateCardRequest,
  UpdateListRequest,
  UserDirectoryList,
  UserRole,
} from "@app/types";
import { tokenStore } from "./token-store";

// In local dev, "/api" is proxied to the NestJS server by vite.config.ts.
// In production the web app is served as static files with no proxy, so the
// deployed API's absolute URL must be baked in at build time via this env var.
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data: AuthResponse = await res.json();
        tokenStore.setTokens(data.accessToken, data.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const accessToken = tokenStore.getAccessToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && !isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, true);
    tokenStore.clear();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: (body: RegisterRequest) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body: LoginRequest) => request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    logout: (refreshToken: string) => request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),
    me: () => request<CurrentUser>("/auth/me"),
  },
  admin: {
    listUsers: (params: { search?: string; page?: number; pageSize?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.search) query.set("search", params.search);
      if (params.page) query.set("page", String(params.page));
      if (params.pageSize) query.set("pageSize", String(params.pageSize));
      const qs = query.toString();
      return request<AdminUserList>(`/admin/users${qs ? `?${qs}` : ""}`);
    },
    updateUserRole: (id: string, role: UserRole) =>
      request<AdminUser>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    updateUserStatus: (id: string, isActive: boolean) =>
      request<AdminUser>(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
  },
  users: {
    // Member-facing directory for the add-member picker (active users only).
    list: (params: { search?: string; page?: number; pageSize?: number } = {}) => {
      const query = new URLSearchParams();
      if (params.search) query.set("search", params.search);
      if (params.page) query.set("page", String(params.page));
      if (params.pageSize) query.set("pageSize", String(params.pageSize));
      const qs = query.toString();
      return request<UserDirectoryList>(`/users${qs ? `?${qs}` : ""}`);
    },
  },
  boards: {
    list: () => request<BoardSummary[]>("/boards"),
    create: (body: CreateBoardRequest) => request<BoardSummary>("/boards", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => request<BoardDetail>(`/boards/${id}`),
    update: (id: string, body: UpdateBoardRequest) =>
      request<BoardSummary>(`/boards/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addMember: (id: string, email: string) =>
      request<BoardMember>(`/boards/${id}/members`, { method: "POST", body: JSON.stringify({ email }) }),
    removeMember: (id: string, userId: string) =>
      request<void>(`/boards/${id}/members/${userId}`, { method: "DELETE" }),
  },
  lists: {
    create: (boardId: string, body: CreateListRequest) =>
      request<List>(`/boards/${boardId}/lists`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateListRequest) =>
      request<List>(`/lists/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/lists/${id}`, { method: "DELETE" }),
  },
  cards: {
    create: (listId: string, body: CreateCardRequest) =>
      request<Card>(`/lists/${listId}/cards`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateCardRequest) =>
      request<Card>(`/cards/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    history: (id: string) => request<CardActivity[]>(`/cards/${id}/history`),
    updateAccess: (id: string, body: UpdateCardAccessRequest) =>
      request<Card>(`/cards/${id}/access`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" }),
  },
};

export { ApiError };
