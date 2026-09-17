import { useState, type FormEvent } from "react";
import type { AdminUser, UpdateUserRequest } from "@app/types";

interface EditUserModalProps {
  user: AdminUser;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: UpdateUserRequest) => void;
}

/**
 * Admin edit of a user's descriptive fields — `PATCH /admin/users/:id`. Role,
 * status, permissions and passwords keep their own row actions, and `username`
 * is the login credential and never editable, so this form only carries the
 * display name and the (optional) contact email. Only changed fields are sent,
 * so a rename alone is not also seen as an email edit server-side; an emptied
 * field is sent as `""`, which clears the address.
 */
export function EditUserModal({ user, saving, error, onClose, onSave }: EditUserModalProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? "");

  const trimmedName = displayName.trim();
  const trimmedEmail = email.trim();
  const nameChanged = trimmedName !== user.displayName;
  const emailChanged = trimmedEmail !== (user.email ?? "");
  const canSave = trimmedName.length > 0 && (nameChanged || emailChanged) && !saving;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      ...(nameChanged ? { displayName: trimmedName } : {}),
      ...(emailChanged ? { email: trimmedEmail } : {}),
    });
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">تعديل بيانات المستخدم</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:underline">
            إغلاق
          </button>
        </div>

        {error && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">الاسم المعروض</span>
          <input
            required
            maxLength={100}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">اسم المستخدم</span>
          <input
            value={user.username}
            disabled
            className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
          <span className="text-xs text-slate-500">اسم الدخول لا يمكن تعديله.</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-600">البريد الإلكتروني (اختياري)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">للتواصل فقط، وليس لتسجيل الدخول. اتركه فارغًا لإزالته.</span>
        </label>

        <div className="flex justify-start gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
}
