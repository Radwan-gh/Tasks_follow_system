import { generateKeyBetween } from "@app/ordering";

/**
 * Resolve the new fractional-index position for a move, given the IDs of the
 * intended neighbors. Positions are re-read fresh (via `fetchPosition`)
 * rather than trusting client-supplied strings, so a stale drag can never
 * corrupt ordering — the caller is expected to run this inside the same
 * transaction as the position write.
 */
export async function computeMovePosition(
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
  fetchPosition: (id: string) => Promise<string | null>,
): Promise<string> {
  const beforePos = beforeId ? await fetchPosition(beforeId) : null;
  const afterPos = afterId ? await fetchPosition(afterId) : null;
  return generateKeyBetween(beforePos, afterPos);
}
