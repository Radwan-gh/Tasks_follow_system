import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@app/api-client";
import { api } from "@/lib/api";
import { useOpenCard } from "@/lib/board-cache";
import { notificationTarget } from "@/lib/board-sharing";
import { getDeviceId } from "@/lib/device-id";
import { lastTappedPush, onPushReceived, onPushTapped, onPushTokenChange, registerForPush } from "@/lib/push";

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
  const openCard = useOpenCard();
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
    const tokenRotation = onPushTokenChange(() => void syncPushDevice());
    return () => {
      appState.remove();
      tokenRotation.remove();
    };
  }, []);

  // A push arriving while the app is open should update the bell badge now,
  // rather than waiting out the remainder of its 30s poll interval — and the
  // card/board it's about, so another user's change shows up immediately on
  // whichever of them is on screen instead of at the next poll.
  useEffect(() => {
    const received = onPushReceived(({ cardId, boardId }) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (typeof cardId === "string" && cardId.length > 0) {
        for (const key of ["card", "cardHistory", "cardComments"]) {
          void queryClient.invalidateQueries({ queryKey: [key, cardId] });
        }
      }
      if (typeof boardId === "string" && boardId.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ["board", boardId] });
      }
    });
    return () => received.remove();
  }, [queryClient]);

  // Tapping a notification opens the card it refers to — or, for board
  // sharing, the approver queue or the board (`notificationTarget`).
  useEffect(() => {
    const openFromData = (data: Record<string, unknown> | null) => {
      const text = (key: string) => (typeof data?.[key] === "string" ? (data[key] as string) : null);
      const target = notificationTarget({ type: text("type"), cardId: text("cardId"), boardId: text("boardId") });
      if (target?.kind === "card") openCard(target.cardId, target.boardId);
      else if (target?.kind === "board") router.push(`/board/${target.boardId}`);
      else if (target?.kind === "board-requests") router.push("/board-requests");
    };

    // Covers the cold-start case: the tap that launched the app has already
    // fired by the time this listener attaches.
    void lastTappedPush().then(openFromData);

    const subscription = onPushTapped(openFromData);
    return () => subscription.remove();
  }, [openCard, router]);
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
