import { useEffect } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { registerForPush } from "@/lib/push";

/** Remembered so `logout` can tell the server to forget this device. */
let currentPushToken: string | null = null;

export function getCurrentPushToken(): string | null {
  return currentPushToken;
}

/**
 * Registers this device for OS push and routes a tapped notification to its
 * card. Mounted once, in the root navigator, under both `AuthProvider` and
 * `QueryClientProvider`.
 *
 * Every path here is best-effort: a denied permission, a device without Google
 * Play services, or an unreachable API must never stop the app from starting,
 * so nothing in this hook is allowed to throw.
 */
export function usePushRegistration(userId: string | undefined): void {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Re-registers whenever the signed-in user changes. Also covers token
  // rotation, since FCM can issue a new token at any launch.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      try {
        const registration = await registerForPush();
        if (!registration || cancelled) return;
        await api.notifications.registerDevice(registration);
        currentPushToken = registration.token;
      } catch {
        // Push is an enhancement — the in-app notification centre still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

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

/** Clears the remembered token after logout has deregistered it. */
export function clearCurrentPushToken(): void {
  currentPushToken = null;
}
