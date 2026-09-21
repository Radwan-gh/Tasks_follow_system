import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { useDismissableLayer } from "../lib/use-dismissable-layer";
import { UserAvatar } from "../features/boards/components/MemberPicker";

const ROLE_LABEL: Record<string, string> = { ADMIN: "مشرف", USER: "عضو" };

/** The sidebar's bottom user card — opens a small popover with حسابي / تسجيل الخروج. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDismissableLayer(ref, open, () => setOpen(false));

  if (!user) return null;

  return (
    <div ref={ref} className="relative mt-auto">
      {open && (
        <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-field border border-line bg-surface py-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              navigate("/account");
            }}
            className="block w-full px-3 py-2 text-start text-sm text-ink hover:bg-canvas"
          >
            حسابي
          </button>
          <button
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="block w-full px-3 py-2 text-start text-sm text-alert hover:bg-canvas"
          >
            تسجيل الخروج
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-field bg-canvas p-2.5 text-start hover:bg-line/40"
      >
        <UserAvatar displayName={user.displayName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{user.displayName}</span>
          <span className="block truncate text-xs text-muted">{ROLE_LABEL[user.role] ?? user.role}</span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          ⌄
        </span>
      </button>
    </div>
  );
}
