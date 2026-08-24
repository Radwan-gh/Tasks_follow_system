import { QueryClient } from "@tanstack/react-query";

/** Same defaults as the web app (`apps/web/src/lib/query-client.ts`). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
    },
  },
});
