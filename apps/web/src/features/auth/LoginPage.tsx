import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const REMEMBERED_USERNAME_KEY = "kanban.rememberedUsername";

/**
 * «تذكّرني» on the web keeps only the *username* in `localStorage` — any script
 * on the origin can read it, so a password never goes there. The password is
 * handed to the browser's own password manager instead: the inputs carry
 * `autocomplete` hints, and where the Credential Management API exists
 * (Chromium) it is stored explicitly, since an SPA sign-in never navigates away
 * and some browsers miss the save prompt without it.
 */
function readRememberedUsername(): string {
  try {
    return localStorage.getItem(REMEMBERED_USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberLogin(username: string, password: string, remember: boolean) {
  try {
    if (remember) localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
    else localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  } catch {
    // Storage blocked (private mode etc.) — nothing to remember with.
  }
  if (!remember) return;
  // Not in TypeScript's DOM lib — Chromium-only.
  const PasswordCredentialCtor = (
    window as { PasswordCredential?: new (data: { id: string; password: string }) => Credential }
  ).PasswordCredential;
  if (PasswordCredentialCtor && navigator.credentials) {
    navigator.credentials.store(new PasswordCredentialCtor({ id: username, password })).catch(() => undefined);
  }
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(readRememberedUsername);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => readRememberedUsername() !== "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ username, password });
      rememberLogin(username.trim(), password, rememberMe);
      navigate("/boards");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-xl font-semibold text-slate-900">تسجيل الدخول</h1>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
        <input
          type="text"
          name="username"
          required
          autoComplete="username"
          placeholder="اسم المستخدم"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="كلمة المرور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          تذكّرني
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {submitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
        <p className="text-center text-xs text-slate-400">
          لإنشاء حساب جديد، تواصل مع مدير النظام.
        </p>
      </form>
    </div>
  );
}
