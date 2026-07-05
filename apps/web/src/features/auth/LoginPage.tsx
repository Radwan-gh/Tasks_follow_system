import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/boards");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>
        <p className="text-center text-sm text-slate-500">
          No account?{" "}
          <Link to="/register" className="text-slate-900 underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
