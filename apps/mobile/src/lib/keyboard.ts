import { useEffect, useState, type RefObject } from "react";
import { Keyboard, Platform, type KeyboardEvent, type View } from "react-native";

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
 * How much of `ref`'s box the keyboard covers, in dp.
 *
 * Measured rather than assumed equal to the keyboard height, because the
 * container is not always flush with the bottom of the window: a tab screen
 * stops above the tab bar, so only the part of the keyboard *below* that edge
 * is overlap. Feeding the result back as `paddingBottom` is safe — padding is
 * interior to the frame, so it never moves the container's own bottom edge and
 * the measurement cannot chase itself.
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
    node.measureInWindow((_x, y, _width, height) => {
      if (!cancelled) setOverlap(Math.max(0, y + height - frame.top));
    });
    return () => {
      cancelled = true;
    };
  }, [frame, ref]);

  return overlap;
}
