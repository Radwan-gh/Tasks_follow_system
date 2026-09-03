import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Default shown while `GET /settings` is still loading — matches the server's own schema default. */
const DEFAULT_CURRENCY_SYMBOL = "ل.س";

/** §3c-1: the admin-set currency symbol shown next to every cost amount app-wide. Any authenticated user can read it. */
export function useCurrencySymbol(): string {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api.settings.get(), staleTime: 5 * 60_000 });
  return data?.currencySymbol ?? DEFAULT_CURRENCY_SYMBOL;
}
