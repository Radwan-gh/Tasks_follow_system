import { useQuery } from "@tanstack/react-query";
import { api } from "./api-client";

/** `AppSettings.currencySymbol`, shown next to every cost amount in the app. */
export function useCurrencySymbol(): string {
  const { data } = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  return data?.currencySymbol ?? "";
}
