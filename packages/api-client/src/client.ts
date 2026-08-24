import type {
  AdminUser,
  AdminUserList,
  AuthResponse,
  ChangePasswordRequest,
  CreateUserRequest,
  BoardDetail,
  BoardMember,
  BoardSummary,
  Card,
  CardActivity,
  CompletedTasksReport,
  CreateBoardRequest,
  CreateCardRequest,
  CreateListRequest,
  CreateSubtaskRequest,
  CurrentUser,
  List,
  LoginRequest,
  OverdueTasksReport,
  ReportOverview,
  Subtask,
  UpdateAssigneesRequest,
  UpdateBoardRequest,
  UpdateCardAccessRequest,
  UpdateCardRequest,
  UpdateListRequest,
  UpdateSubtaskRequest,
  UserRole,
  WorkloadReport,
} from "@app/types";
import { ApiError } from "./error.js";

/**
 * Where the access/refresh token pair lives. Deliberately allows sync *or*
 * async implementations: the web app backs this with `localStorage` (sync),
 * the mobile app with `expo-secure-store` (async). The client awaits every
 * call, so a sync adapter needs no wrapping.
 */
export interface TokenStorage {
  getAccessToken(): string | null | Promise<string | null>;
  getRefreshToken(): string | null | Promise<string | null>;
  setTokens(accessToken: string, refreshToken: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface ApiClientOptions {
  /** Absolute API origin, or a same-origin prefix like "/api" on the web. */
  baseUrl: string;
  storage: TokenStorage;
  /**
   * Called once the session is unrecoverable: a 401 was retried, the refresh
   * failed, and the stored tokens have been cleared. The host app decides what
   * that means — a redirect on the web, a navigation reset on mobile.
   */
  onUnauthorized?: () => void;
}

/**
 * A 401 from the auth endpoints themselves is terminal, not "the access token
 * aged out". Running the refresh-and-retry dance there does real damage:
 * a wrong password comes back to the caller as `ApiError(401, "Session
 * expired")` instead of the API's "Invalid credentials", and a failed re-login
 * wipes the tokens of whoever is already signed in.
 */
const TERMINAL_401_PATHS = ["/auth/login", "/auth/refresh"];

export function createApiClient({ baseUrl, storage, onUnauthorized }: ApiClientOptions) {
  // Shared in-flight promise so concurrent 401s trigger exactly one refresh
  // instead of a stampede that would rotate the refresh token N times.
  let refreshInFlight: Promise<boolean> | null = null;

  async function refreshAccessToken(): Promise<boolean> {
    const refreshToken = await storage.getRefreshToken();
    if (!refreshToken) return false;

    if (!refreshInFlight) {
      refreshInFlight = fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
        .then(async (res) => {
          if (!res.ok) return false;
          const data: AuthResponse = await res.json();
          await storage.setTokens(data.accessToken, data.refreshToken);
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
    const accessToken = await storage.getAccessToken();
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

    const canRefresh = !isRetry && !TERMINAL_401_PATHS.some((p) => path.startsWith(p));
    if (res.status === 401 && canRefresh) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return request<T>(path, options, true);
      await storage.clear();
      onUnauthorized?.();
      throw new ApiError(401, "Session expired");
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, body.message ?? "Request failed");
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  return {
    /** Escape hatch for endpoints not yet wrapped below (and for tests). */
    request,
    auth: {
      login: (body: LoginRequest) =>
        request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
      logout: (refreshToken: string) =>
        request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),
      changePassword: (body: ChangePasswordRequest) =>
        request<void>("/auth/change-password", { method: "POST", body: JSON.stringify(body) }),
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
      createUser: (body: CreateUserRequest) =>
        request<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(body) }),
      setUserPassword: (id: string, password: string) =>
        request<AdminUser>(`/admin/users/${id}/password`, {
          method: "PATCH",
          body: JSON.stringify({ password }),
        }),
      updateUserRole: (id: string, role: UserRole) =>
        request<AdminUser>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
      updateUserStatus: (id: string, isActive: boolean) =>
        request<AdminUser>(`/admin/users/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive }),
        }),
    },
    boards: {
      list: () => request<BoardSummary[]>("/boards"),
      create: (body: CreateBoardRequest) =>
        request<BoardSummary>("/boards", { method: "POST", body: JSON.stringify(body) }),
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
      updateAssignees: (id: string, body: UpdateAssigneesRequest) =>
        request<Card>(`/cards/${id}/assignees`, { method: "PATCH", body: JSON.stringify(body) }),
      remove: (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" }),
    },
    subtasks: {
      list: (cardId: string) => request<Subtask[]>(`/cards/${cardId}/subtasks`),
      create: (cardId: string, body: CreateSubtaskRequest) =>
        request<Subtask>(`/cards/${cardId}/subtasks`, { method: "POST", body: JSON.stringify(body) }),
      update: (id: string, body: UpdateSubtaskRequest) =>
        request<Subtask>(`/subtasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
      updateAssignees: (id: string, body: UpdateAssigneesRequest) =>
        request<Subtask>(`/subtasks/${id}/assignees`, { method: "PATCH", body: JSON.stringify(body) }),
      remove: (id: string) => request<void>(`/subtasks/${id}`, { method: "DELETE" }),
    },
    reports: {
      overview: () => request<ReportOverview>("/reports/overview"),
      completed: (since?: string) =>
        request<CompletedTasksReport>(
          `/reports/completed${since ? `?since=${encodeURIComponent(since)}` : ""}`,
        ),
      overdue: () => request<OverdueTasksReport>("/reports/overdue"),
      workload: () => request<WorkloadReport>("/reports/workload"),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
