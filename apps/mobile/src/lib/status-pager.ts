/**
 * Page math for the board screen's horizontal status pager
 * (`app/board/[id].tsx`), also used by the attachment image viewer's pager
 * (`ImagePager` in `features/cards/attachments-section.tsx`) — any full-width
 * horizontal pager in this RTL app needs the same measured offsets. Kept free
 * of React Native imports so it can be unit-tested on its own.
 *
 * Each status page is exactly `pageWidth` wide and reports its own laid-out
 * `x`, which *is* the scroll offset that shows it — whichever way the platform
 * lays the row out (see the pager comment in the board screen). Those measured
 * offsets are trusted only while they look like a real pager row: one per
 * status, all distinct. Anything else is a measuring bug, not a layout — on
 * Android a column `ScrollView` with a `refreshControl` reports `x = 0`
 * relative to its own refresh wrapper, which made every status snap to the
 * same spot. In that case the offsets are derived from `pageWidth` instead,
 * so a layout quirk can never silently break paging again.
 */

/**
 * Scroll offset per status index, or `null` while some pages are still unmeasured.
 * `contentOffset.x` stays a raw left-to-right measurement even in RTL, so the
 * fallback puts the first status at the right-most page there.
 */
export function resolveColumnOffsets(
  measured: readonly (number | undefined)[],
  count: number,
  pageWidth: number,
  isRTL: boolean,
): number[] | null {
  if (count === 0) return [];
  const offsets = measured.slice(0, count);
  if (offsets.length < count || offsets.some((x) => x == null)) return null;
  if (looksLikePagerRow(offsets as number[], pageWidth)) return offsets as number[];
  return Array.from({ length: count }, (_, index) => (isRTL ? count - 1 - index : index) * pageWidth);
}

function looksLikePagerRow(offsets: number[], pageWidth: number): boolean {
  const sorted = [...offsets].sort((a, b) => a - b);
  // Pages are a whole viewport apart; half a page is a generous tolerance for rounding.
  return sorted.every((x, i) => i === 0 || x - sorted[i - 1]! > pageWidth / 2);
}

/** Snap points for the pager's `snapToOffsets`, ascending. */
export function snapOffsetsFor(offsets: readonly number[]): number[] {
  return [...offsets].sort((a, b) => a - b);
}

/** The status whose page is nearest to `offsetX`; `current` when nothing is measured yet. */
export function indexFromOffset(offsets: readonly number[], offsetX: number, current: number): number {
  let closest = current;
  let smallestGap = Infinity;
  offsets.forEach((offset, index) => {
    const gap = Math.abs(offset - offsetX);
    if (gap < smallestGap) {
      smallestGap = gap;
      closest = index;
    }
  });
  return closest;
}
