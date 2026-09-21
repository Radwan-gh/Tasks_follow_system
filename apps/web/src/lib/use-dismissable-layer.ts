import { useEffect, type RefObject } from "react";

/**
 * Closes a floating surface (dropdown, popover, panel) on an outside pointer
 * press or Escape. Shared by every floating UI in the v2 redesign instead of
 * each one re-implementing its own listener pair.
 */
export function useDismissableLayer(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;

    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, ref, onDismiss]);
}
