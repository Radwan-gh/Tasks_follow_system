import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { I18nManager, Platform, Vibration, View, type ScrollView } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { BoardCard, List } from "@app/types";
import { AppText } from "@/components/text";
import { groupSlotRange, isUrgent, slotFromCenter, sortByPriority } from "@/lib/reorder";
import { neighbourIndexToward } from "@/lib/status-pager";
import { colors, radii, spacing } from "@/theme/tokens";

/**
 * Drag to reorder on the board screen — design §5c, «نفس الحركة في عرض اللوحة».
 *
 * Holding a card for 350 ms lifts it. A copy then follows the finger in an
 * overlay above the pager, while the card itself steps out of its column and a
 * dashed placeholder marks where it will land. Dropping inside the column
 * reorders it there; dropping on one of the status chips at the top moves it
 * to the top of that status; holding it at a screen edge pages to the
 * neighbouring status so it can be placed precisely there. Letting go without
 * moving opens the move/delete sheet, which the same long-press opened before.
 *
 * The gesture is a `Pan` that activates after the long-press, so a tap still
 * opens the card and a quick swipe still scrolls or pages: only a finger held
 * still for 350 ms starts a drag. The scroll views stay the plain core ones the
 * pager's RTL handling relies on (`app/board/[id].tsx`); they are switched off
 * for the length of a drag instead.
 *
 * Hit-testing runs on the JS thread against window rects measured when the
 * drag starts (and again after each page change), so cards shifting around the
 * placeholder never feed back into where the placeholder goes.
 */

/** How far a finger may wander and still count as "let go without moving". */
const STATIONARY_SLOP = 10;
/** The status chips accept a drop a little above and below their own rect. */
const CHIP_SLOP = 8;
const EDGE_ZONE = 28;
const EDGE_HOLD_MS = 500;
/** Time for the pager (and the chip strip after it) to settle before re-measuring. */
const PAGE_SETTLE_MS = 350;
const AUTO_SCROLL_ZONE = 56;
const AUTO_SCROLL_MAX_STEP = 14;

export interface BoardDrag {
  card: BoardCard;
  sourceListId: string;
  height: number;
  /** Where the lifted copy starts, in the overlay host's coordinates. */
  overlay: { top: number; start: number; end: number };
  /** Top of the «أفلت على حالة» hint, just under the chip strip. */
  hintTop: number | null;
  /** The status (list index) the card is being dragged over. */
  targetIndex: number;
  /** Display slot in that column, counted without the dragged card. */
  slot: number | null;
  /** The status chip under the finger, when it accepts the card. */
  hoverChip: number | null;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(view: View | null | undefined): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, w, h) => resolve({ x, y, w, h }));
  });
}

const buzz = () => {
  // iOS ignores the duration and buzzes for ~400 ms — far too much for a lift.
  if (Platform.OS === "android") Vibration.vibrate(15);
};

interface DragContextValue {
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  lift: SharedValue<number>;
  start: (cardId: string, absX: number, absY: number, localX: number, localY: number) => void;
  move: (absX: number, absY: number) => void;
  end: (success: boolean, stationary: boolean) => void;
  registerCard: (cardId: string, ref: RefObject<View | null>) => () => void;
}

const BoardDragContext = createContext<DragContextValue | null>(null);
export const BoardDragProvider = BoardDragContext.Provider;

interface Snapshot {
  listIndex: number;
  /** The column's scroll offset when its cards were measured. */
  scrollAt: number;
  /** Window-Y midpoints of the column's other cards, as shown, ascending. */
  midpoints: number[];
  range: { start: number; end: number };
}

interface Session {
  card: BoardCard;
  sourceIndex: number;
  targetIndex: number;
  height: number;
  grabY: number;
  calibX: number;
  calibY: number;
  lastX: number;
  lastY: number;
  ready: boolean;
  page: Rect | null;
  strip: Rect | null;
  chips: (Rect | null)[];
  snapshot: Snapshot | null;
  slot: number | null;
  hoverChip: number | null;
  edgeSide: "left" | "right" | null;
  edgeTimer: ReturnType<typeof setTimeout> | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  autoStep: number;
  autoFrame: number | null;
}

export function useBoardDrag(options: {
  lists: List[];
  /** Screen width — the pager's page width. */
  width: number;
  columnOffsets: number[];
  scrollToColumn: (index: number) => void;
  /** Whether a card may be dropped into a list («انتهى» is limited — §3b-4). */
  accepts: (card: BoardCard, list: List) => boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** `slot` is the display slot in the target column; a chip drop passes 0 (the top of the card's group). */
  onDrop: (card: BoardCard, sourceListId: string, targetListId: string, slot: number) => void;
  onOpenActions: (cardId: string) => void;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const session = useRef<Session | null>(null);

  const cardRefs = useRef(new Map<string, RefObject<View | null>>());
  const pages = useRef<(View | null)[]>([]);
  const columns = useRef<(ScrollView | null)[]>([]);
  const columnScrollY = useRef<number[]>([]);
  const columnContentHeight = useRef<number[]>([]);
  const chipViews = useRef<(View | null)[]>([]);
  const hostRef = useRef<View | null>(null);

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lift = useSharedValue(0);

  // Everything below reads the latest props through `optionsRef` and the live
  // session through `session`, so the handlers can be created once: the
  // per-card gestures are memoised on them, and a gesture that is rebuilt
  // mid-drag is cancelled.
  const handlers = useMemo(() => {
    function publish() {
      const s = session.current;
      if (!s) return;
      setDrag((d) =>
        d && (d.slot !== s.slot || d.hoverChip !== s.hoverChip || d.targetIndex !== s.targetIndex)
          ? { ...d, slot: s.slot, hoverChip: s.hoverChip, targetIndex: s.targetIndex }
          : d,
      );
    }

    /** The chips' rects, and the band they span — clipped to the screen, since the strip scrolls. */
    async function measureChips(s: Session) {
      const { lists, width } = optionsRef.current;
      s.chips = await Promise.all(lists.map((_, i) => measure(chipViews.current[i])));
      const shown = s.chips.filter((r): r is Rect => !!r && r.h > 0);
      if (shown.length === 0) {
        s.strip = null;
        return;
      }
      const top = Math.min(...shown.map((r) => r.y));
      const bottom = Math.max(...shown.map((r) => r.y + r.h));
      s.strip = { x: 0, y: top, w: width, h: bottom - top };
    }

    /** Measures a column's cards as shown, minus the dragged one. */
    async function snapshotColumn(s: Session, listIndex: number, draggedInFlow: boolean): Promise<Snapshot | null> {
      const list = optionsRef.current.lists[listIndex];
      if (!list) return null;
      const shown = sortByPriority(list.cards);
      const others = shown.filter((c) => c.id !== s.card.id);
      const rects = await Promise.all(others.map((c) => measure(cardRefs.current.get(c.id)?.current)));
      // At lift time the card is still in the column: everything below it
      // moves up by its height (plus the column gap) once it steps out.
      const draggedAt = draggedInFlow ? shown.findIndex((c) => c.id === s.card.id) : -1;
      const midpoints = rects.map((r, i) => {
        if (!r) return Number.POSITIVE_INFINITY;
        const shift = draggedAt !== -1 && i >= draggedAt ? s.height + spacing.sm : 0;
        return r.y + r.h / 2 - shift;
      });
      return {
        listIndex,
        scrollAt: columnScrollY.current[listIndex] ?? 0,
        midpoints,
        range: groupSlotRange(others, isUrgent(s.card)),
      };
    }

    function stopAutoScroll(s: Session) {
      s.autoStep = 0;
      if (s.autoFrame != null) cancelAnimationFrame(s.autoFrame);
      s.autoFrame = null;
    }

    function autoScrollTick() {
      const s = session.current;
      if (!s || !s.autoStep || !s.page) {
        if (s) s.autoFrame = null;
        return;
      }
      const i = s.targetIndex;
      const current = columnScrollY.current[i] ?? 0;
      const max = Math.max(0, (columnContentHeight.current[i] ?? 0) - s.page.h);
      const next = Math.min(Math.max(current + s.autoStep, 0), max);
      if (next !== current) {
        columns.current[i]?.scrollTo({ y: next, animated: false });
        columnScrollY.current[i] = next;
        evaluate();
      }
      s.autoFrame = requestAnimationFrame(autoScrollTick);
    }

    function pageToward(side: "left" | "right") {
      const s = session.current;
      if (!s) return;
      s.edgeTimer = null;
      s.edgeSide = null;
      const { columnOffsets, lists, accepts, scrollToColumn } = optionsRef.current;
      const target = neighbourIndexToward(columnOffsets, s.targetIndex, side);
      if (target == null || !accepts(s.card, lists[target]!)) return;
      buzz();
      stopAutoScroll(s);
      s.targetIndex = target;
      s.snapshot = null;
      s.slot = null;
      publish();
      scrollToColumn(target);
      s.settleTimer = setTimeout(async () => {
        s.settleTimer = null;
        if (session.current !== s) return;
        await measureChips(s);
        const snapshot = await snapshotColumn(s, target, false);
        if (session.current !== s || s.targetIndex !== target) return;
        s.snapshot = snapshot;
        // Still held at the edge: forgetting the side lets `evaluate` re-arm
        // the timer to page on further, even if the finger got there mid-settle.
        s.edgeSide = null;
        evaluate();
      }, PAGE_SETTLE_MS);
    }

    function evaluate() {
      const s = session.current;
      if (!s || !s.ready) return;
      const fx = s.lastX + s.calibX;
      const fy = s.lastY + s.calibY;
      const { lists, accepts, width } = optionsRef.current;

      const overChips = !!s.strip && fy >= s.strip.y - CHIP_SLOP && fy <= s.strip.y + s.strip.h + CHIP_SLOP;
      if (overChips) {
        const strip = s.strip!;
        const index =
          fx >= strip.x && fx <= strip.x + strip.w ? s.chips.findIndex((r) => !!r && fx >= r.x && fx <= r.x + r.w) : -1;
        s.hoverChip = index !== -1 && accepts(s.card, lists[index]!) ? index : null;
        stopAutoScroll(s);
        setEdge(s, null);
        publish();
        return;
      }
      s.hoverChip = null;

      const page = s.page;
      if (page && s.snapshot && s.snapshot.listIndex === s.targetIndex && fy >= page.y && fy <= page.y + page.h) {
        const { snapshot } = s;
        const scrolled = (columnScrollY.current[s.targetIndex] ?? 0) - snapshot.scrollAt;
        const centre = fy - s.grabY + s.height / 2 + scrolled;
        const slot = slotFromCenter(snapshot.midpoints, centre);
        s.slot = Math.min(Math.max(slot, snapshot.range.start), snapshot.range.end);
      }

      // Auto-scroll the column while the finger sits near its top or bottom.
      if (page) {
        const intoTop = page.y + AUTO_SCROLL_ZONE - fy;
        const intoBottom = fy - (page.y + page.h - AUTO_SCROLL_ZONE);
        const depth = intoTop > 0 ? -Math.min(intoTop, AUTO_SCROLL_ZONE) : intoBottom > 0 ? Math.min(intoBottom, AUTO_SCROLL_ZONE) : 0;
        s.autoStep = Math.round((depth / AUTO_SCROLL_ZONE) * AUTO_SCROLL_MAX_STEP);
        if (s.autoStep && s.autoFrame == null) s.autoFrame = requestAnimationFrame(autoScrollTick);
        if (!s.autoStep) stopAutoScroll(s);
      }

      // Held at a screen edge: page to the neighbouring status.
      setEdge(s, fx < EDGE_ZONE ? "left" : fx > width - EDGE_ZONE ? "right" : null);
      publish();
    }

    function setEdge(s: Session, side: "left" | "right" | null) {
      if (s.edgeSide === side) return;
      if (s.edgeTimer) clearTimeout(s.edgeTimer);
      s.edgeTimer = null;
      s.edgeSide = side;
      // No paging until the column just paged to has been measured.
      if (side && !s.settleTimer) s.edgeTimer = setTimeout(() => pageToward(side), EDGE_HOLD_MS);
    }

    function clear(s: Session) {
      stopAutoScroll(s);
      if (s.edgeTimer) clearTimeout(s.edgeTimer);
      if (s.settleTimer) clearTimeout(s.settleTimer);
    }

    async function start(cardId: string, absX: number, absY: number, localX: number, localY: number) {
      const { lists, onDragStart } = optionsRef.current;
      const sourceIndex = lists.findIndex((l) => l.cards.some((c) => c.id === cardId));
      const card = lists[sourceIndex]?.cards.find((c) => c.id === cardId);
      if (!card) return;
      buzz();
      onDragStart();
      const s: Session = {
        card,
        sourceIndex,
        targetIndex: sourceIndex,
        height: 0,
        grabY: localY,
        calibX: 0,
        calibY: 0,
        lastX: absX,
        lastY: absY,
        ready: false,
        page: null,
        strip: null,
        chips: [],
        snapshot: null,
        slot: null,
        hoverChip: null,
        edgeSide: null,
        edgeTimer: null,
        settleTimer: null,
        autoStep: 0,
        autoFrame: null,
      };
      session.current = s;

      const [rect, host, page] = await Promise.all([
        measure(cardRefs.current.get(cardId)?.current),
        measure(hostRef.current),
        measure(pages.current[sourceIndex]),
      ]);
      await measureChips(s);
      if (session.current !== s || !rect || !host) return;
      s.height = rect.h;
      s.page = page;
      // Gesture-handler's absolute coordinates and the window's can differ by
      // a status bar; the touch point inside the card ties the two together.
      s.calibX = rect.x + localX - absX;
      s.calibY = rect.y + localY - absY;
      s.snapshot = await snapshotColumn(s, sourceIndex, true);
      if (session.current !== s) return;
      const shownIndex = sortByPriority(lists[sourceIndex]!.cards).findIndex((c) => c.id === cardId);
      s.slot = shownIndex;
      s.ready = true;

      // `start`/`end` are direction-relative, so the copy lines up with the
      // card whichever side RTL puts the gutters on.
      const left = rect.x - host.x;
      const right = host.x + host.w - (rect.x + rect.w);
      setDrag({
        card,
        sourceListId: lists[sourceIndex]!.id,
        height: rect.h,
        overlay: {
          top: rect.y - host.y,
          start: I18nManager.isRTL ? right : left,
          end: I18nManager.isRTL ? left : right,
        },
        hintTop: s.strip ? s.strip.y + s.strip.h - host.y : null,
        targetIndex: sourceIndex,
        slot: shownIndex,
        hoverChip: null,
      });
      evaluate();
    }

    function move(absX: number, absY: number) {
      const s = session.current;
      if (!s) return;
      s.lastX = absX;
      s.lastY = absY;
      evaluate();
    }

    function end(success: boolean, stationary: boolean) {
      const s = session.current;
      session.current = null;
      if (!s) return;
      clear(s);
      const { lists, onDrop, onOpenActions, onDragEnd } = optionsRef.current;
      onDragEnd();
      if (success && stationary) {
        onOpenActions(s.card.id);
      } else if (success && s.ready) {
        const sourceListId = lists[s.sourceIndex]?.id;
        const chipList = s.hoverChip != null ? lists[s.hoverChip] : null;
        const columnList = s.slot != null ? lists[s.targetIndex] : null;
        if (sourceListId && chipList) onDrop(s.card, sourceListId, chipList.id, 0);
        else if (sourceListId && columnList) onDrop(s.card, sourceListId, columnList.id, s.slot!);
      }
      // After the drop's optimistic update has landed, so the card never
      // flashes back in its old place between the two renders.
      setTimeout(() => setDrag(null), 0);
    }

    function registerCard(cardId: string, ref: RefObject<View | null>) {
      cardRefs.current.set(cardId, ref);
      return () => {
        if (cardRefs.current.get(cardId) === ref) cardRefs.current.delete(cardId);
      };
    }

    return { start, move, end, registerCard, clear };
  }, []);

  useEffect(
    () => () => {
      if (session.current) handlers.clear(session.current);
      session.current = null;
    },
    [handlers],
  );

  const context = useMemo<DragContextValue>(
    () => ({ tx, ty, lift, start: handlers.start, move: handlers.move, end: handlers.end, registerCard: handlers.registerCard }),
    [tx, ty, lift, handlers],
  );

  return {
    drag,
    context,
    tx,
    ty,
    lift,
    hostRef,
    pageRef: (index: number) => (view: View | null) => {
      pages.current[index] = view;
    },
    columnRef: (index: number) => (view: ScrollView | null) => {
      columns.current[index] = view;
    },
    chipRef: (index: number) => (view: View | null) => {
      chipViews.current[index] = view;
    },
    onColumnScroll: (index: number, y: number) => {
      columnScrollY.current[index] = y;
    },
    onColumnContentSize: (index: number, height: number) => {
      columnContentHeight.current[index] = height;
    },
  };
}

/**
 * A card in a board column that can be lifted and dragged. Mid-drag the card
 * itself stays mounted — unmounting it would cancel the very gesture moving
 * it — but steps out of the column's flow, invisible, while the overlay copy
 * follows the finger.
 */
export function DraggableCard({
  cardId,
  enabled,
  hidden,
  animateLayout,
  children,
}: {
  cardId: string;
  enabled: boolean;
  /** This card is the one being dragged. */
  hidden: boolean;
  /** A drag is on: let the other cards slide to make room for the placeholder. */
  animateLayout: boolean;
  children: ReactNode;
}) {
  const ctx = useContext(BoardDragContext);
  const ref = useRef<View>(null);
  const started = useSharedValue(false);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const travelled = useSharedValue(0);

  useEffect(() => ctx?.registerCard(cardId, ref), [ctx, cardId]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(enabled && !!ctx)
      .activateAfterLongPress(350);
    if (!ctx) return pan;
    const { tx, ty, lift, start, move, end } = ctx;
    // Translation comes from absolute coordinates: the card's own view moves
    // out of the flow (and with auto-scroll), which would skew view-relative ones.
    return pan
      .onStart((e) => {
        started.value = true;
        originX.value = e.absoluteX;
        originY.value = e.absoluteY;
        travelled.value = 0;
        tx.value = 0;
        ty.value = 0;
        lift.value = withTiming(1, { duration: 120 });
        scheduleOnRN(start, cardId, e.absoluteX, e.absoluteY, e.x, e.y);
      })
      .onUpdate((e) => {
        const dx = e.absoluteX - originX.value;
        const dy = e.absoluteY - originY.value;
        tx.value = dx;
        ty.value = dy;
        travelled.value = Math.max(travelled.value, Math.hypot(dx, dy));
        scheduleOnRN(move, e.absoluteX, e.absoluteY);
      })
      .onFinalize((_e, success) => {
        if (!started.value) return;
        started.value = false;
        lift.value = 0;
        scheduleOnRN(end, success, travelled.value < STATIONARY_SLOP);
      });
  }, [ctx, enabled, cardId, started, originX, originY, travelled]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        layout={animateLayout && !hidden ? LinearTransition.duration(140) : undefined}
        style={hidden ? { position: "absolute", top: 0, start: 0, end: 0, opacity: 0 } : undefined}
      >
        <View ref={ref} collapsable={false}>
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Where the dragged card will land: its own height, dashed in the accent colour. */
export function DropPlaceholder({ height }: { height: number }) {
  return (
    <Animated.View
      layout={LinearTransition.duration(140)}
      style={{
        height,
        borderRadius: radii.card,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: colors.accent,
        backgroundColor: colors.accentSoft,
        opacity: 0.7,
      }}
    />
  );
}

/** The lifted copy that follows the finger, plus the hint under the chips. Lives in a `pointerEvents="none"` host over the pager. */
export function DragOverlay({
  drag,
  tx,
  ty,
  lift,
  renderCard,
}: {
  drag: BoardDrag | null;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  lift: SharedValue<number>;
  renderCard: (card: BoardCard) => ReactNode;
}) {
  const follow = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${-1.5 * lift.value}deg` },
      { scale: 1 + 0.02 * lift.value },
    ],
  }));
  if (!drag) return null;
  return (
    <>
      {drag.hintTop != null ? (
        <View style={{ position: "absolute", top: drag.hintTop, start: spacing.xl, end: spacing.xl, alignItems: "flex-start" }}>
          <AppText
            size="caption"
            weight="semibold"
            color={colors.accent}
            style={{ backgroundColor: colors.canvas, borderRadius: radii.chip, paddingHorizontal: spacing.sm }}
          >
            أفلت على حالة لنقلها إليها
          </AppText>
        </View>
      ) : null}
      <Animated.View
        style={[{ position: "absolute", top: drag.overlay.top, start: drag.overlay.start, end: drag.overlay.end }, follow]}
      >
        {renderCard(drag.card)}
      </Animated.View>
    </>
  );
}
