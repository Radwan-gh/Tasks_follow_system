import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./features/auth/AuthContext";
import { LoginPage } from "./features/auth/LoginPage";
import { RegisterPage } from "./features/auth/RegisterPage";
import { BoardsListPage } from "./features/boards/BoardsListPage";
import { BoardPage } from "./features/boards/BoardPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/boards"
        element={
          <ProtectedRoute>
            <BoardsListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/boards/:boardId"
        element={
          <ProtectedRoute>
            <BoardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/boards" replace />} />
    </Routes>
  );
}
