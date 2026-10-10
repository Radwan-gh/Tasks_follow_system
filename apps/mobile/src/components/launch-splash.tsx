import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { AppText } from "@/components/text";
import { colors, fonts } from "@/theme/tokens";

/**
 * `expo-splash-screen`'s `imageWidth` in app.json. The native splash draws
 * `splash-icon.png` as a square this many dp wide, centred in the window, and
 * this screen's first frame must land on exactly the same pixels.
 */
const MARK_SIZE = 96;

/**
 * `splash-check.png` + `splash-leaf.png` are `splash-icon.png` split in two:
 * same 512px canvas, same placement, so stacked they redraw the native frame
 * and the leaf can move on its own. Both are rasterised from the
 * `logo/ghiras-icon.svg` geometry; regenerate all three together.
 */
const checkLayer = require("../../assets/images/splash-check.png");
const leafLayer = require("../../assets/images/splash-leaf.png");

/** The leaf's stem — where it meets the check — relative to the mark's centre, in dp. */
const STEM = { x: 15.2, y: -3.5 };

/** How far the mark rises to make room for the name beneath it. */
const LIFT = 30;
/** The name's resting offset below the screen centre, and how far it rises into place. */
const NAME_Y = 42;
const NAME_RISE = 14;

/** The intro's length. The splash never leaves before this, however fast auth is. */
const INTRO_MS = 850;
const EXIT_MS = 360;

interface LaunchSplashProps {
  /** Fonts and the stored session are in; the app underneath can be shown. */
  ready: boolean;
  /** The exit has finished — unmount the splash. */
  onFinished: () => void;
}

/**
 * The animated continuation of the native splash. It opens on the native
 * frame, then the leaf of «غِراس» (seedlings) sways on its stem while the mark
 * lifts and the name rises in beneath it. If the session is still loading
 * after that, the leaf keeps a slow sway so the screen doesn't read as frozen.
 * Once `ready`, it fades off over the app.
 *
 * Covering the auth restore is the point: before this, the native splash
 * dropped as soon as Cairo loaded and the app showed a blank canvas until
 * `useAuth().isLoading` settled.
 */
export function LaunchSplash({ ready, onFinished }: LaunchSplashProps) {
  const reduceMotion = useReducedMotion();
  const [introDone, setIntroDone] = useState(reduceMotion);

  const leaf = useSharedValue(0); // degrees
  const lift = useSharedValue(0); // 0 → 1
  const name = useSharedValue(0); // 0 → 1
  const exit = useSharedValue(0); // 0 → 1

  useEffect(() => {
    if (reduceMotion) return;
    leaf.value = withSequence(
      withTiming(14, { duration: 340, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 5, stiffness: 110, mass: 0.8 }),
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(2, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    lift.value = withDelay(180, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    name.value = withDelay(380, withTiming(1, { duration: 470, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduceMotion, leaf, lift, name]);

  useEffect(() => {
    if (!ready || !introDone) return;
    exit.value = withTiming(1, { duration: EXIT_MS, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(onFinished);
    });
  }, [ready, introDone, exit, onFinished]);

  const screenStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -LIFT * lift.value }, { scale: 1 + 0.08 * exit.value }],
  }));
  const leafStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: STEM.x },
      { translateY: STEM.y },
      { rotate: `${leaf.value}deg` },
      { translateX: -STEM.x },
      { translateY: -STEM.y },
    ],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: name.value,
    transform: [{ translateY: NAME_Y + NAME_RISE * (1 - name.value) - 10 * exit.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.screen, screenStyle]}
      // Swallow touches until it is gone, so nothing underneath is tappable
      // through a splash that is still on screen.
      pointerEvents={ready && introDone ? "none" : "auto"}
      // Drop the native splash only once this one is laid out on top of it.
      onLayout={() => void SplashScreen.hideAsync()}
      accessible
      accessibilityLabel="غِراس"
    >
      <StatusBar style="light" />
      <View style={styles.center}>
        <Animated.View style={[styles.mark, markStyle]}>
          <Image source={checkLayer} style={styles.layer} />
          <Animated.Image source={leafLayer} style={[styles.layer, leafStyle]} />
        </Animated.View>
      </View>
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={nameStyle}>
          <AppText weight="bold" color={colors.onBrand} style={styles.name}>
            غِراس
          </AppText>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.brand },
  center: { ...FILL, alignItems: "center", justifyContent: "center" },
  mark: { width: MARK_SIZE, height: MARK_SIZE },
  layer: { ...FILL, width: MARK_SIZE, height: MARK_SIZE },
  name: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 64, letterSpacing: 0 },
});
