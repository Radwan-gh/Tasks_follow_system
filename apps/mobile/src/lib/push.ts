import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import type * as NotificationsModule from "expo-notifications";
import type { DevicePlatform } from "@app/types";
import { colors } from "@/theme/tokens";

type Notifications = typeof NotificationsModule;

/**
 * `expo-notifications`, or `null` inside Expo Go.
 *
 * Expo Go dropped remote push on Android in SDK 53, and the module now throws
 * the moment it is *imported* there — a top-level `import` took the whole app
 * down before the login screen, closing the quick no-native-build review loop
 * the docs promise. So the module is only ever required here, lazily, and
 * never in Expo Go. Push was never going to work in Expo Go anyway; everything
 * below simply becomes a no-op there. A dev or release build is unaffected.
 */
const notifications: Notifications | null =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberately lazy, see above
      (require("expo-notifications") as Notifications);

/**
 * Foreground presentation. Without this a push arriving while the app is open
 * is delivered silently — the user sees nothing until they open the bell.
 */
notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Android 8+ drops any notification whose channel does not exist, so this must
 * run before the first push arrives. The name is user-visible in Android's
 * system settings, hence Arabic. The id must match the `channelId` the server
 * sends (`apps/api/src/notifications/push/fcm.service.ts`).
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || !notifications) return;
  await notifications.setNotificationChannelAsync("default", {
    name: "الإشعارات",
    importance: notifications.AndroidImportance.MAX,
    lightColor: colors.accent,
  });
}

/**
 * Asks for permission (on Android 13+ this is the `POST_NOTIFICATIONS` prompt)
 * and returns the device's native FCM token, or null if push is unavailable.
 *
 * Deliberately `getDevicePushTokenAsync`, not `getExpoPushTokenAsync`: the
 * server talks to FCM directly, so there is no Expo project id in this repo to
 * mint an Expo token against.
 */
export async function registerForPush(): Promise<{ token: string; platform: DevicePlatform } | null> {
  // Simulators and emulators cannot receive push, and asking would just fail.
  if (!Device.isDevice || !notifications) return null;

  await ensureAndroidChannel();

  const existing = await notifications.getPermissionsAsync();
  // Only prompt once. If the user has said no, re-asking does nothing on
  // Android and is a no-op dialog on iOS — they must use system settings.
  const granted =
    existing.granted || (existing.canAskAgain && (await notifications.requestPermissionsAsync()).granted);
  if (!granted) return null;

  const { data } = await notifications.getDevicePushTokenAsync();
  if (typeof data !== "string" || data.length === 0) return null;

  return { token: data, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" };
}

/** Mirrors the unread count onto the launcher badge. Best-effort — unsupported launchers just ignore it. */
export async function setBadgeCount(count: number): Promise<void> {
  await notifications?.setBadgeCountAsync(count).catch(() => undefined);
}

type Subscription = { remove: () => void };
const NO_SUBSCRIPTION: Subscription = { remove: () => undefined };

/** FCM rotated this install's token. */
export function onPushTokenChange(listener: () => void): Subscription {
  return notifications?.addPushTokenListener(listener) ?? NO_SUBSCRIPTION;
}

/** The `data` payload of a push that arrived while the app was open. */
export function onPushReceived(listener: (data: Record<string, unknown>) => void): Subscription {
  return (
    notifications?.addNotificationReceivedListener((n) => listener(n.request.content.data ?? {})) ?? NO_SUBSCRIPTION
  );
}

/** The `data` payload of a push the user tapped. */
export function onPushTapped(listener: (data: Record<string, unknown>) => void): Subscription {
  return (
    notifications?.addNotificationResponseReceivedListener((r) => listener(r.notification.request.content.data ?? {})) ??
    NO_SUBSCRIPTION
  );
}

/** The tap that cold-started the app, if any — it fired before any listener could attach. */
export async function lastTappedPush(): Promise<Record<string, unknown> | null> {
  if (!notifications) return null;
  const response = await notifications.getLastNotificationResponseAsync().catch(() => null);
  return response?.notification.request.content.data ?? null;
}
