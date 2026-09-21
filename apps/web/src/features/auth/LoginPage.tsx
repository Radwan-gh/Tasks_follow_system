import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api-client";
import { useAuth } from "./AuthContext";

/**
 * The API separates bad credentials (401) from a deactivated account (403),
 * and each deserves its own wording — a user whose account an admin switched
 * off should not keep retyping a password that is in fact correct. Anything
 * else (network down, API unreachable) is a third case, since the raw message
 * there is an English fetch error the user cannot act on.
 */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "هذا الحساب غير مفعّل. راجع مدير النظام.";
    if (error.status === 401) return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  }
  return "تعذّر تسجيل الدخول. تحقّق من اتصالك ثم أعد المحاولة.";
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  // `?expired=1` is set by the API client's `onUnauthorized` — reached only
  // when a refresh itself failed, so it always means a real session expiry
  // and never a rejected sign-in attempt.
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionExpired = searchParams.get("expired") === "1";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    // The expiry notice has been read by the time a new attempt starts;
    // leaving it up next to a credentials error would read as two failures.
    if (sessionExpired) setSearchParams({}, { replace: true });
    setSubmitting(true);
    try {
      await login({ username: username.trim(), password });
      navigate("/boards");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-card border border-line bg-surface p-8 shadow-sm"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-ink">تسجيل الدخول</h1>
          <p className="text-sm text-muted">متابعة مهام الفريق ولوحات المشاريع.</p>
        </div>

        {sessionExpired && !error && (
          <p className="rounded-field bg-accent-soft px-3 py-2 text-sm text-accent">
            انتهت الجلسة. سجّل الدخول من جديد للمتابعة.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-field bg-alert-bg px-3 py-2 text-sm text-alert">
            {error}
          </p>
        )}

        <Field label="اسم المستخدم">
          <input
            type="text"
            required
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder="اسم المستخدم"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            className="w-full rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
          />
        </Field>

        <Field label="كلمة المرور">
          <div className="flex items-center gap-2">
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="w-full flex-1 rounded-field border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="shrink-0 rounded-field px-2 py-2 text-sm font-medium text-accent hover:bg-accent-soft"
            >
              {showPassword ? "إخفاء" : "إظهار"}
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-field bg-accent px-3 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </button>

        <p className="text-center text-xs text-muted">
          الدخول باسم المستخدم لا بالبريد الإلكتروني. لإنشاء حساب جديد، تواصل مع مدير النظام.
        </p>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-ink/70">{label}</span>
      {children}
    </label>
  );
}
