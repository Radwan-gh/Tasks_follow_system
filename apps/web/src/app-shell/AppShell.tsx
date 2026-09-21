import { Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { Sidebar } from "./Sidebar";

/**
 * Persistent chrome for the whole app. Signed-out (login screen, or the brief
 * flash before `/auth/me` resolves) gets no sidebar — nav needs `user.role`
 * and per-user badges that don't exist yet at that point.
 */
export function AppShell() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen bg-canvas">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
