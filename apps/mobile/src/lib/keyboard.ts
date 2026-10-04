import { createRef, useEffect, useState, type RefObject } from "react";
import { Dimensions, Keyboard, Platform, type KeyboardEvent, type View } from "react-native";

/** The keyboard's top edge and height, in window coordinates (dp). */
type KeyboardFrame = { top: number; height: number };

/**
 * The software keyboard's frame, or `null` while it is closed.
 *
 * Android draws edge-to-edge — Expo SDK 54+ makes that non-optional, which is
 * also why the tab bar reserves `insets.bottom` itself — and an edge-to-edge
 * window is never resized by `adjustResize`: the IME just draws *over* the app.
 * So nothing moves out of the keyboard's way on its own, and RN's
 * `KeyboardAvoidingView` with the Android default (`behavior={undefined}`) is a
 * no-op there. The keyboard *events* still fire with a correct frame, so the
 * fix is to read it here and shrink the container ourselves.
 */
function useKeyboardFrame(): KeyboardFrame | null {
  const [frame, setFrame] = useState<KeyboardFrame | null>(null);

  useEffect(() => {
    // iOS gets the `will*` pair so the layout moves with the keyboard's own
    // animation; Android only ever emits the `did*` pair.
    const showEvent = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event: KeyboardEvent) => {
      const { screenY, height } = event.endCoordinates;
      // A zero-height frame is the keyboard on its way out — and how iOS
      // reports a hardware keyboard, which needs no room at all.
      setFrame(height > 0 ? { top: screenY, height } : null);
    };

    const show = Keyboard.addListener(showEvent, onShow);
    const hide = Keyboard.addListener(hideEvent, () => setFrame(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return frame;
}

/** Keyboard height in dp, `0` when closed. Includes the gesture/navigation bar area. */
export function useKeyboardHeight(): number {
  return useKeyboardFrame()?.height ?? 0;
}

/**
 * The app's outermost full-window view (attached in `app/_layout.tsx`). The
 * keyboard overlap is measured *relative to it* — see `useKeyboardOverlap`.
 */
export const windowRootRef = createRef<View>();

function measureInWindow(node: View): Promise<{ y: number; height: number }> {
  return new Promise((resolve) => node.measureInWindow((_x, y, _width, height) => resolve({ y, height })));
}

/**
 * How much of `ref`'s box the keyboard covers, in dp.
 *
 * Measured rather than assumed equal to the keyboard height, because the
 * container is not always flush with the bottom of the window: a tab screen
 * stops above the tab bar, so only the part of the keyboard *below* that edge
 * is overlap. Feeding the result back as `paddingBottom` is safe — padding is
 * interior to the frame, so it never moves the container's own bottom edge and
 * the measurement cannot chase itself.
 *
 * No two coordinate spaces are ever compared directly. The keyboard event's
 * `screenY` is in *screen* coordinates, while `measureInWindow` on Android
 * subtracts the visible window frame's top — so comparing them, as this used
 * to, came up short by exactly the status bar height wherever the two origins
 * differ (Expo Go), which left the board's quick-add field under the keyboard.
 * Instead each side is reduced to a distance from the bottom edge within its
 * own space: the keyboard's from the screen's bottom, the container's from the
 * root view's bottom (both measured the same way, so their offset cancels).
 * The root runs edge-to-edge, so those two bottoms are the same line. Where it
 * does not (a window that stops above the navigation bar) the error is the
 * bar's height *extra* room — the field sits a little high, never hidden.
 */
export function useKeyboardOverlap(ref: RefObject<View | null>): number {
  const frame = useKeyboardFrame();
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (!frame) {
      setOverlap(0);
      return;
    }
    const node = ref.current;
    if (!node) return;

    let cancelled = false;
    const root = windowRootRef.current;
    void Promise.all([measureInWindow(node), root ? measureInWindow(root) : null]).then(([box, rootBox]) => {
      if (cancelled) return;
      if (!rootBox) {
        setOverlap(Math.max(0, box.y + box.height - frame.top));
        return;
      }
      const keyboardFromBottom = Dimensions.get("screen").height - frame.top;
      const boxFromBottom = rootBox.y + rootBox.height - (box.y + box.height);
      setOverlap(Math.max(0, keyboardFromBottom - boxFromBottom));
    });
    return () => {
      cancelled = true;
    };
  }, [frame, ref]);

  return overlap;
}
