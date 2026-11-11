import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** The API's minimum (`SearchQuerySchema`): one Arabic letter matches nearly everything. */
export const MIN_SEARCH_LENGTH = 2;

/** Typing pauses this long before a request goes out. */
const DEBOUNCE_MS = 250;

/**
 * `GET /search` for what is typed in a search box — across the user's boards,
 * or inside `boardId`. Requests wait for a pause in typing, an older answer
 * stays on screen while the next one loads (no flash back to skeletons on each
 * letter), and a superseded request is aborted.
 */
export function useSearch(text: string, boardId?: string) {
  const trimmed = text.trim();
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const enabled = debounced.length >= MIN_SEARCH_LENGTH;
  const query = useQuery({
    queryKey: ["search", boardId ?? null, debounced],
    queryFn: ({ signal }) => api.search({ q: debounced, boardId }, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  return {
    query,
    /** Whether the box holds enough to search at all. */
    active: trimmed.length >= MIN_SEARCH_LENGTH,
    /** Typing has not paused yet, or the answer for what is typed has not arrived. */
    pending: trimmed !== debounced || (enabled && (query.isPending || query.isPlaceholderData)),
  };
}
