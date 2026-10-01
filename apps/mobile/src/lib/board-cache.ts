import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { BoardDetail, Card } from "@app/types";

/**
 * Board/card cache sharing between the board screen and `/card/:id`.
 *
 * The board screen already holds every visible card in full (`BoardDetail`'s
 * lists carry `CardSchema` objects), so opening a task seeds `["card", id]`
 * from it instead of waiting on `GET /cards/:id` and then a second, full
 * `GET /boards/:id`. Seeded entries keep the *board's* fetch time, so with the
 * global 5 s `staleTime` they are shown instantly and still refetched in the
 * background — the cache only ever paints the first frame.
 */

/** Polling interval for an open board/card — same cadence as the notification bell. */
export const LIVE_REFETCH_MS = 30_000;

/** «انتهى» shows the last 30 days by default (`v2-new-style.md`'s "يعرض آخر 30 يومًا"). */
export function recentClosedSince(): string {
  return new Date(Date.now() - 30 * 86400000).toISOString();
}

/**
 * One stable key per board and «انتهى» mode, shared by the board screen and the
 * card screen. Still prefix-matched by every `invalidateQueries({ queryKey: ["board", id] })`.
 */
export function boardDetailKey(boardId: string, mode: "recent" | "all") {
  return ["board", boardId, mode] as const;
}

function isBoardDetail(data: unknown): data is BoardDetail {
  return !!data && typeof data === "object" && Array.isArray((data as BoardDetail).lists);
}

/** Newest cached `BoardDetail` for this board, whichever key it lives under (skips `["board", id, "summary"]`). */
export function findCachedBoard(queryClient: QueryClient, boardId: string) {
  let best: { data: BoardDetail; updatedAt: number } | undefined;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: ["board", boardId] })) {
    const { data, dataUpdatedAt } = query.state;
    if (isBoardDetail(data) && (!best || dataUpdatedAt > best.updatedAt)) best = { data, updatedAt: dataUpdatedAt };
  }
  return best;
}

/** The card as the newest cached board containing it last saw it. */
export function findCachedCard(queryClient: QueryClient, cardId: string, boardId?: string) {
  let best: { card: Card; updatedAt: number } | undefined;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: boardId ? ["board", boardId] : ["board"] })) {
    const { data, dataUpdatedAt } = query.state;
    if (!isBoardDetail(data) || (best && dataUpdatedAt <= best.updatedAt)) continue;
    for (const list of data.lists) {
      const card = list.cards.find((c) => c.id === cardId);
      if (card) {
        best = { card, updatedAt: dataUpdatedAt };
        break;
      }
    }
  }
  return best;
}

/**
 * Opens `/card/:id`. Seeds `["card", id]` from a cached board when that board
 * is newer than what's already cached (so a card just moved on the board never
 * opens showing its old status), and passes `boardId` so the card screen can
 * fetch the board in parallel when nothing is cached (push, «مهامي», notifications).
 */
export function useOpenCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    (cardId: string, boardId?: string | null) => {
      if (cardId.startsWith("temp:")) return;
      const cached = findCachedCard(queryClient, cardId, boardId || undefined);
      const existing = queryClient.getQueryState(["card", cardId]);
      if (cached && (!existing?.dataUpdatedAt || cached.updatedAt > existing.dataUpdatedAt)) {
        queryClient.setQueryData(["card", cardId], cached.card, { updatedAt: cached.updatedAt });
      }
      router.push({ pathname: "/card/[id]", params: boardId ? { id: cardId, boardId } : { id: cardId } });
    },
    [router, queryClient],
  );
}
