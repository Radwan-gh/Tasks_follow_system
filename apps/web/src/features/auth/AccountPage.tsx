import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api-client";
import { useAuth } from "./AuthContext";

/** §3c-1 "إعدادات عامة: حقل نصي واحد «رمز العملة»" — admin-only, mirrors the mobile account screen's section. */
function CurrencySettingSection() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const [symbol, setSymbol] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data && !seeded) {
      setSymbol(settings.data.currencySymbol);
      setSeeded(true);
    }
  }, [settings.data, seeded]);

  async function save() {
    setSaving(true);
    try {
      await api.settings.update({ currencySymbol: symbol.trim() });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setSaving(false);
    }
  }

  const dirty = symbol.trim().length > 0 && symbol.trim() !== settings.data?.currencySymbol;

  return (
    <div className="space-y-3 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">رمز العملة</h2>
      <p className="text-sm text-slate-500">يظهر بجانب كل مبالغ التكلفة في التطبيق.</p>
      <div className="flex gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          maxLength={10}
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setSubmitting(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تغيير كلمة المرور");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-900">حسابي</h1>
          <Link to="/boards" className="text-sm text-slate-500 underline">
            العودة إلى اللوحات
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>{user?.displayName}</span>
          <button onClick={logout} className="text-slate-500 underline">
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md p-6">
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">تغيير كلمة المرور</h2>
          {error && <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
          {success && <p className="rounded bg-green-50 p-2 text-sm text-green-700">تم تغيير كلمة المرور بنجاح.</p>}
          <input
            type="password"
            required
            placeholder="كلمة المرور الحالية"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="تأكيد كلمة المرور الجديدة"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {submitting ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
          </button>
        </form>

        {user?.role === "ADMIN" ? (
          <div className="mt-6">
            <CurrencySettingSection />
          </div>
        ) : null}
      </main>
    </div>
  );
}
