import type {
  AdminUser,
  AdminUserList,
  AuthResponse,
  BoardDetail,
  BoardSummary,
  Card,
  CardActivity,
  ChecklistItem,
  CreateBoardRequest,
  CreateCardRequest,
  CreateChecklistItemRequest,
  CreateListRequest,
  CreateRecurringSubtaskRequest,
  CreateRecurringTaskRequest,
  CurrentUser,
  List,
  LoginRequest,
  RecurringReport,
  RecurringTask,
  RegisterRequest,
  UpdateBoardRequest,
  UpdateCardRequest,
  UpdateChecklistItemRequest,
  UpdateListRequest,
  UpdateRecurringSubtaskRequest,
  UpdateRecurringTaskRequest,
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
  boards: {
    list: () => request<BoardSummary[]>("/boards"),
    create: (body: CreateBoardRequest) => request<BoardSummary>("/boards", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => request<BoardDetail>(`/boards/${id}`),
    update: (id: string, body: UpdateBoardRequest) =>
      request<BoardSummary>(`/boards/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    addMember: (id: string, email: string) =>
      request<unknown>(`/boards/${id}/members`, { method: "POST", body: JSON.stringify({ email }) }),
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
    remove: (id: string) => request<void>(`/cards/${id}`, { method: "DELETE" }),
    checklist: (id: string) => request<ChecklistItem[]>(`/cards/${id}/checklist`),
    addChecklistItem: (id: string, body: CreateChecklistItemRequest) =>
      request<ChecklistItem>(`/cards/${id}/checklist`, { method: "POST", body: JSON.stringify(body) }),
    updateChecklistItem: (itemId: string, body: UpdateChecklistItemRequest) =>
      request<ChecklistItem>(`/checklist-items/${itemId}`, { method: "PATCH", body: JSON.stringify(body) }),
    removeChecklistItem: (itemId: string) =>
      request<void>(`/checklist-items/${itemId}`, { method: "DELETE" }),
  },
  recurringTasks: {
    list: (boardId: string) => request<RecurringTask[]>(`/boards/${boardId}/recurring-tasks`),
    create: (boardId: string, body: CreateRecurringTaskRequest) =>
      request<RecurringTask>(`/boards/${boardId}/recurring-tasks`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateRecurringTaskRequest) =>
      request<RecurringTask>(`/recurring-tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/recurring-tasks/${id}`, { method: "DELETE" }),
    addSubtask: (id: string, body: CreateRecurringSubtaskRequest) =>
      request<RecurringTask>(`/recurring-tasks/${id}/subtasks`, { method: "POST", body: JSON.stringify(body) }),
    updateSubtask: (subtaskId: string, body: UpdateRecurringSubtaskRequest) =>
      request<RecurringTask>(`/recurring-subtasks/${subtaskId}`, { method: "PATCH", body: JSON.stringify(body) }),
    removeSubtask: (subtaskId: string) =>
      request<RecurringTask>(`/recurring-subtasks/${subtaskId}`, { method: "DELETE" }),
    generate: (id: string) => request<Card>(`/recurring-tasks/${id}/generate`, { method: "POST" }),
  },
  reports: {
    recurring: (boardId: string, params: { from?: string; to?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.from) query.set("from", params.from);
      if (params.to) query.set("to", params.to);
      const qs = query.toString();
      return request<RecurringReport>(`/boards/${boardId}/recurring-report${qs ? `?${qs}` : ""}`);
    },
  },
};

export { ApiError };
