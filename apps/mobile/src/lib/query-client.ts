import { AppState, Platform } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";

/** Same defaults as the web app (`apps/web/src/lib/query-client.ts`). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
});

// React Native has no `window` focus event, so React Query's refetch-on-focus
// is a no-op until it's told about app state: returning to the app refetches
// every visible, stale query (other users' edits included), and
// `refetchInterval` polling pauses while the app is in the background.
focusManager.setEventListener((setFocused) => {
  if (Platform.OS === "web") return undefined;
  const subscription = AppState.addEventListener("change", (state) => setFocused(state === "active"));
  return () => subscription.remove();
});
