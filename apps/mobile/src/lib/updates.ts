import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

/**
 * `updates.checkAutomatically: "ON_LOAD"` (app.json) only checks for a new
 * OTA bundle on cold start. Most sessions never cold-start again once the
 * app is open, so without this a published update would sit unused until
 * the user force-quits — this re-checks whenever the app is foregrounded
 * and applies it immediately instead.
 */
export function useAutoUpdate() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    const checkAndApply = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Offline or the update server is unreachable — keep running the
        // current bundle, there is nothing actionable to surface here.
      }
    };

    void checkAndApply();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkAndApply();
    });
    return () => subscription.remove();
  }, []);
}
