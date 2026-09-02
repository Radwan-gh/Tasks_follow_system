import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Polls the `version.json` emitted by vite.config.ts's `versionFilePlugin`
 * against the id this bundle was built with (`__BUILD_ID__`). A mismatch
 * means a new build has been deployed while this tab was open — the caller
 * decides how to surface that (see UpdateBanner).
 */
export function useAppUpdate(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/version.json", { cache: "no-store" });
        if (!response.ok) return;
        const { buildId } = (await response.json()) as { buildId: string };
        if (!cancelled && buildId !== __BUILD_ID__) setUpdateAvailable(true);
      } catch {
        // Offline or mid-deploy blip — the next poll will retry.
      }
    };

    void check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return updateAvailable;
}
