import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import { api } from "@/lib/api";
import { getDeviceId } from "@/lib/device-id";
import { registerForPush } from "@/lib/push";

export interface PushStatus {
  deviceId: string | null;
  /** Whether the last sync reached the server, and whether it was linked to a user. */
  state: "idle" | "registered" | "error";
  linkedToUser: boolean;
  lastSyncedAt: string | null;
  /** Human-readable reason the last sync failed, shown on the «إرسال إشعار» screen. */
  error: string | null;
}

let status: PushStatus = { deviceId: null, state: "idle", linkedToUser: false, lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<PushStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((listener) => listener());
}

/** Live registration status of this install — the on-device diagnostic for push. */
export function usePushStatus(): PushStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}

/** The signed-in user at the moment a queued sync actually runs, not when it was requested. */
let currentUserId: string | undefined;
/** Serialises syncs so a launch-time anonymous call can never land after the login-time linking call. */
let queue: Promise<void> = Promise.resolve();

/**
 * Sends this install's FCM token to the server: anonymously while signed out,
 * linked to the user while signed in. Safe to call as often as you like —
 * both endpoints are idempotent by `deviceId`.
 *
 * Never throws: push is an enhancement and must not stop the app. But failures
 * are recorded in `PushStatus` and logged (`adb logcat | grep "\[push\]"`)
 * rather than swallowed — a silent `catch {}` here is what previously left no
 * device row and no clue why.
 */
export function syncPushDevice(): Promise<void> {
  queue = queue.then(async () => {
    try {
      const deviceId = await getDeviceId();
      setStatus({ deviceId });

      const registration = await registerForPush();
      if (!registration) {
        setStatus({
          state: "error",
          error: "الإشعارات غير متاحة على هذا الجهاز: الإذن مرفوض أو ليس جهازًا حقيقيًا",
        });
        console.warn("[push] no device token: permission denied or not a physical device");
        return;
      }

      const body = { deviceId, ...registration };
      const userId = currentUserId;
      if (userId) await api.notifications.registerDevice(body);
      else await api.devices.register(body);

      setStatus({ state: "registered", linkedToUser: !!userId, lastSyncedAt: new Date().toISOString(), error: null });
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.message}` : String(error);
      setStatus({ state: "error", error: message });
      console.warn("[push] device registration failed:", message);
    }
  });
  return queue;
}

/**
 * Registers this install for OS push and routes a tapped notification to its
 * card. Mounted once, in the root navigator, under both `AuthProvider` and
 * `QueryClientProvider`.
 *
 * Registration does not wait for sign-in: it runs as soon as the app opens
 * (anonymously while the auth check is still pending), again whenever the
 * signed-in user changes (to link or re-link the install), whenever the app
 * returns from the background, and whenever FCM rotates the token.
 */
export function usePushRegistration(userId: string | undefined): void {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    currentUserId = userId;
    void syncPushDevice();
  }, [userId]);

  useEffect(() => {
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void syncPushDevice();
    });
    const tokenRotation = Notifications.addPushTokenListener(() => void syncPushDevice());
    return () => {
      appState.remove();
      tokenRotation.remove();
    };
  }, []);

  // A push arriving while the app is open should update the bell badge now,
  // rather than waiting out the remainder of its 30s poll interval.
  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => received.remove();
  }, [queryClient]);

  // Tapping a notification opens the card it refers to.
  useEffect(() => {
    const openFromResponse = (response: Notifications.NotificationResponse | null) => {
      const cardId = response?.notification.request.content.data?.cardId;
      if (typeof cardId === "string" && cardId.length > 0) router.push(`/card/${cardId}`);
    };

    // Covers the cold-start case: the tap that launched the app has already
    // fired by the time this listener attaches.
    void Notifications.getLastNotificationResponseAsync().then(openFromResponse).catch(() => undefined);

    const subscription = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => subscription.remove();
  }, [router]);
}

/**
 * Logout: unlink this install from the user while the session is still valid.
 * The server keeps the row and its FCM token, so the phone stays reachable
 * anonymously; the `userId` effect above then re-syncs it as anonymous.
 */
export async function unlinkPushDevice(): Promise<void> {
  try {
    await api.notifications.unregisterDevice(await getDeviceId());
  } catch (error) {
    console.warn("[push] unlink on logout failed:", String(error));
  }
}
