import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "node:fs";
import { cert, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushResult {
  token: string;
  ok: boolean;
  /** FCM says this token is dead (app uninstalled, token rotated) — delete the row. */
  unregistered: boolean;
}

/** FCM rejects a `sendEach` batch larger than this. */
const FCM_BATCH_LIMIT = 500;

/**
 * Error codes that mean "this token will never work again", as opposed to a
 * transient failure worth keeping the device row for. `invalid-argument` covers
 * a malformed token (e.g. a placeholder written by a test).
 */
/**
 * The key Firebase downloads the service account under is `project_id`, while
 * the `ServiceAccount` type names it `projectId`. `cert()` accepts both, so
 * only this log line has to care.
 */
function projectIdOf(credential: ServiceAccount): string {
  return credential.projectId ?? (credential as { project_id?: string }).project_id ?? "unknown";
}

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Thin wrapper over `firebase-admin`, sending straight to FCM — this project
 * deliberately does not use Expo's push service, matching the way it already
 * self-hosts OTA updates and builds APKs with Gradle rather than EAS.
 *
 * Credentials are optional on purpose: without them the service logs once and
 * becomes a no-op instead of throwing, so dev machines, CI and anyone running
 * the API without a Firebase project keep working. Never make this constructor
 * or `send` throw on missing config.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const credential = this.loadCredential();
    if (!credential) {
      this.logger.warn(
        "FIREBASE_SERVICE_ACCOUNT(_PATH) not set — push notifications are disabled. The in-app notification centre is unaffected.",
      );
      return;
    }
    try {
      // A named app so this never collides with a default app initialised elsewhere.
      this.app = initializeApp({ credential: cert(credential) }, "push");
      this.logger.log(`Push notifications enabled (FCM project: ${projectIdOf(credential)})`);
    } catch (error) {
      this.logger.error(`Failed to initialise Firebase, push disabled: ${String(error)}`);
    }
  }

  get isEnabled(): boolean {
    return this.app !== null;
  }

  /** Sends every message, chunked to FCM's batch limit. Never throws — a push failure must not break the caller. */
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    if (!this.app || messages.length === 0) return [];

    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += FCM_BATCH_LIMIT) {
      const chunk = messages.slice(i, i + FCM_BATCH_LIMIT);
      results.push(...(await this.sendChunk(chunk)));
    }
    return results;
  }

  private async sendChunk(chunk: PushMessage[]): Promise<PushResult[]> {
    try {
      const response = await getMessaging(this.app!).sendEach(
        chunk.map((message) => ({
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: {
            priority: "high" as const,
            notification: {
              // Must match the channel created in `apps/mobile/src/lib/push.ts`,
              // otherwise Android 8+ drops the notification silently.
              channelId: "default",
            },
          },
        })),
      );

      return chunk.map((message, index) => {
        const result = response.responses[index];
        return {
          token: message.token,
          ok: result?.success ?? false,
          unregistered: !!result?.error && DEAD_TOKEN_CODES.has(result.error.code),
        };
      });
    } catch (error) {
      // A whole-batch failure (network, auth) is transient — keep every token.
      this.logger.error(`FCM send failed for ${chunk.length} message(s): ${String(error)}`);
      return chunk.map((message) => ({ token: message.token, ok: false, unregistered: false }));
    }
  }

  /** Accepts the service-account JSON inline or as a path — inline suits containers, a path suits local dev. */
  private loadCredential(): ServiceAccount | null {
    const inline = this.config.get<string>("FIREBASE_SERVICE_ACCOUNT");
    const path = this.config.get<string>("FIREBASE_SERVICE_ACCOUNT_PATH");
    try {
      if (inline) return JSON.parse(inline) as ServiceAccount;
      if (path) return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
    } catch (error) {
      this.logger.error(`Could not read the Firebase service account, push disabled: ${String(error)}`);
    }
    return null;
  }
}
