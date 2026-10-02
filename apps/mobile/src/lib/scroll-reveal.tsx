import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, type ScrollViewProps, type View } from "react-native";
import { spacing } from "@/theme/tokens";

interface ScrollReveal {
  /**
   * Scroll `node` to the top of the enclosing `RevealScrollView`, `margin` dp
   * below its edge — call it when an inline field gains focus.
   */
  reveal: (node: View | null, margin?: number) => void;
  /** Drop the extra scroll room `reveal` added — call it when that field loses focus. */
  release: () => void;
}

const ScrollRevealContext = createContext<ScrollReveal | null>(null);

/** The enclosing `RevealScrollView`'s handle, or `null` outside one. */
export function useRevealInScroll(): ScrollReveal | null {
  return useContext(ScrollRevealContext);
}

/**
 * A `ScrollView` that lets an inline field growing *downwards* (the people
 * type-ahead, whose suggestions appear under the box) stay clear of the
 * keyboard.
 *
 * `Screen` shrinks for the keyboard and Android then scrolls the focused
 * input just into view — right above the keyboard, which leaves anything
 * rendered below the input underneath it. So a field inside this view calls
 * `useRevealInScroll().reveal` on focus and is scrolled to the *top* of the
 * viewport instead. While a field is revealed the content gets extra bottom
 * padding: without it a field near the end of the screen could not scroll
 * that far up.
 */
export function RevealScrollView({ contentContainerStyle, children, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [revealing, setRevealing] = useState(false);
  const { height } = useWindowDimensions();

  const reveal = useCallback((node: View | null, margin: number = spacing.md) => {
    setRevealing(true);
    // Let the extra bottom room lay out first, so the scroll range reaches the field.
    setTimeout(() => {
      const scroll = scrollRef.current;
      const viewport = scroll?.getNativeScrollRef();
      if (!node || !scroll || !viewport) return;
      viewport.measureInWindow((_x, viewportTop) => {
        node.measureInWindow((_nx, nodeTop) => {
          const y = Math.max(0, offset.current + nodeTop - viewportTop - margin);
          scroll.scrollTo({ y, animated: true });
        });
      });
    }, 50);
  }, []);
  const release = useCallback(() => setRevealing(false), []);
  const value = useMemo(() => ({ reveal, release }), [reveal, release]);

  const base = StyleSheet.flatten(contentContainerStyle) ?? {};
  const basePadding = Number(base.paddingBottom ?? base.paddingVertical ?? base.padding ?? 0);

  return (
    <ScrollView
      {...props}
      ref={scrollRef}
      scrollEventThrottle={16}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.y;
        props.onScroll?.(event);
      }}
      contentContainerStyle={[contentContainerStyle, revealing ? { paddingBottom: basePadding + Math.round(height / 2) } : null]}
    >
      <ScrollRevealContext.Provider value={value}>{children}</ScrollRevealContext.Provider>
    </ScrollView>
  );
}
