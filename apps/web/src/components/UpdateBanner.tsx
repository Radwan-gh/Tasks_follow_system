import { useAppUpdate } from "../lib/use-app-update";

export function UpdateBanner() {
  const updateAvailable = useAppUpdate();
  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <span>يتوفر إصدار جديد من التطبيق</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded bg-white px-3 py-1 font-medium text-slate-900"
      >
        تحديث الآن
      </button>
    </div>
  );
}
