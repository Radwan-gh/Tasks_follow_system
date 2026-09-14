import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import type { DevicePlatform } from "@app/types";

/**
 * Foreground presentation. Without this a push arriving while the app is open
 * is delivered silently — the user sees nothing until they open the bell.
 */
Notifications.setNotificationHandler({
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
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "الإشعارات",
    importance: Notifications.AndroidImportance.MAX,
    lightColor: "#4A6FD4",
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
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  // Only prompt once. If the user has said no, re-asking does nothing on
  // Android and is a no-op dialog on iOS — they must use system settings.
  const granted =
    existing.granted || (existing.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return null;

  const { data } = await Notifications.getDevicePushTokenAsync();
  if (typeof data !== "string" || data.length === 0) return null;

  return { token: data, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" };
}

/** Mirrors the unread count onto the launcher badge. Best-effort — unsupported launchers just ignore it. */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count).catch(() => undefined);
}
