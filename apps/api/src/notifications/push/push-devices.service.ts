import { Injectable, Logger } from "@nestjs/common";
import type { DevicePlatform } from "@app/types";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * The registry of devices a user receives OS push on. Kept separate from
 * `NotificationsService` because it is pure token bookkeeping — no prefs, no
 * notification rows — and because `PushDispatcherService` needs to prune dead
 * tokens without reaching into notification logic.
 */
@Injectable()
export class PushDevicesService {
  private readonly logger = new Logger(PushDevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent by `token`. The same physical device signing in as a different
   * user *moves* to that user rather than creating a second row, so a shared
   * or handed-over phone never keeps pushing the previous user's tasks.
   */
  async register(userId: string, token: string, platform: DevicePlatform): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
  }

  /**
   * Called on logout. Scoped to the owner so one authenticated user cannot
   * deregister another's device by guessing a token. Silent when the token is
   * already gone — there is nothing to report.
   */
  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { token, userId } });
  }

  async listForUsers(userIds: string[]): Promise<{ userId: string; token: string }[]> {
    if (userIds.length === 0) return [];
    return this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, token: true },
    });
  }

  /** Drops tokens FCM reported as permanently dead, so they are not retried forever. */
  async removeDeadTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    const { count } = await this.prisma.pushDevice.deleteMany({ where: { token: { in: tokens } } });
    if (count > 0) this.logger.log(`Pruned ${count} dead push token(s)`);
  }
}
