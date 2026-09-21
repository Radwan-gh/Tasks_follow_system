import { useRef, useState } from "react";
import type { BoardMember } from "@app/types";
import { useDismissableLayer } from "../../../lib/use-dismissable-layer";
import { activeFilterCount, type CardFilters } from "../lib/filter-cards";

interface FilterPopoverProps {
  filters: CardFilters;
  onChange: (filters: CardFilters) => void;
  boardMembers: BoardMember[];
}

export function FilterPopover({ filters, onChange, boardMembers }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissableLayer(ref, open, () => setOpen(false));
  const count = activeFilterCount(filters);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[38px] items-center gap-2 rounded-field border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas"
      >
        ≡ ترشيح
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">{count}</span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-30 mt-2 w-64 space-y-3 rounded-card border border-line bg-surface p-4 shadow-xl">
          <label className="flex items-center justify-between text-sm text-ink">
            مهامي فقط
            <input
              type="checkbox"
              checked={filters.myTasksOnly}
              onChange={(e) => onChange({ ...filters, myTasksOnly: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between text-sm text-ink">
            عاجل فقط
            <input
              type="checkbox"
              checked={filters.urgentOnly}
              onChange={(e) => onChange({ ...filters, urgentOnly: e.target.checked })}
            />
          </label>
          <label className="block space-y-1 text-sm text-ink">
            <span>حسب العضو</span>
            <select
              value={filters.memberId ?? ""}
              onChange={(e) => onChange({ ...filters, memberId: e.target.value || null })}
              className="w-full rounded-field border border-line px-2 py-1 text-sm"
            >
              <option value="">الكل</option>
              {boardMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
