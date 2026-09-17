import { Injectable, Logger } from "@nestjs/common";
import type { PushDevice, RegisterPushDeviceRequest, SendPushTarget } from "@app/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * The registry of app installs that can receive OS push. Kept separate from
 * `NotificationsService` because it is pure token bookkeeping — no prefs, no
 * notification rows — and because `PushDispatcherService` needs to prune dead
 * tokens without reaching into notification logic.
 *
 * Every install registers on launch, signed in or not, keyed by the
 * app-generated `deviceId`. `userId` is only a link: set on login, cleared on
 * logout, so the install keeps its FCM token and stays reachable anonymously.
 */
@Injectable()
export class PushDevicesService {
  private readonly logger = new Logger(PushDevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Anonymous registration (`POST /devices`). Never touches `userId`: the app
   * calls this on launch before its auth check has finished, and that must not
   * unlink a user who is in fact still signed in.
   */
  async registerAnonymous(device: RegisterPushDeviceRequest): Promise<void> {
    await this.upsert(device, {});
  }

  /**
   * Authenticated registration (`POST /notifications/devices`). The same
   * install signing in as a different user *moves* to that user, so a shared or
   * handed-over phone never keeps pushing the previous user's tasks.
   */
  async register(userId: string, device: RegisterPushDeviceRequest): Promise<void> {
    await this.upsert(device, { userId });
  }

  /**
   * Called on logout: drops the user link but keeps the row and its FCM token,
   * so the install still receives anonymous pushes. Scoped to the owner so one
   * authenticated user cannot unlink another's device by guessing an id.
   */
  async unlink(userId: string, deviceId: string): Promise<void> {
    await this.prisma.pushDevice.updateMany({ where: { deviceId, userId }, data: { userId: null } });
  }

  async listAll(): Promise<PushDevice[]> {
    const rows = await this.prisma.pushDevice.findMany({
      orderBy: { lastSeenAt: "desc" },
      select: {
        deviceId: true,
        platform: true,
        lastSeenAt: true,
        user: { select: { id: true, displayName: true, username: true } },
      },
    });
    return rows.map((row) => ({ ...row, lastSeenAt: row.lastSeenAt.toISOString() }));
  }

  async tokensForTarget(target: SendPushTarget): Promise<string[]> {
    const where: Prisma.PushDeviceWhereInput =
      target.kind === "all"
        ? {}
        : target.kind === "devices"
          ? { deviceId: { in: target.deviceIds } }
          : { userId: { in: target.userIds } };
    const rows = await this.prisma.pushDevice.findMany({ where, select: { token: true } });
    return rows.map((row) => row.token);
  }

  async listForUsers(userIds: string[]): Promise<{ userId: string; token: string }[]> {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.pushDevice.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, token: true },
    });
    return rows.flatMap((row) => (row.userId ? [{ userId: row.userId, token: row.token }] : []));
  }

  /** Drops tokens FCM reported as permanently dead, so they are not retried forever. */
  async removeDeadTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    const { count } = await this.prisma.pushDevice.deleteMany({ where: { token: { in: tokens } } });
    if (count > 0) this.logger.log(`Pruned ${count} dead push token(s)`);
  }

  private async upsert(
    { deviceId, token, platform }: RegisterPushDeviceRequest,
    link: { userId?: string },
  ): Promise<void> {
    await this.prisma.$transaction([
      // `token` is unique too: if this token is still held by another row (a
      // reinstall got a fresh deviceId, or a legacy row without one), that row
      // is stale — this install owns the token now.
      this.prisma.pushDevice.deleteMany({ where: { token, OR: [{ deviceId: null }, { deviceId: { not: deviceId } }] } }),
      this.prisma.pushDevice.upsert({
        where: { deviceId },
        create: { deviceId, token, platform, ...link },
        update: { token, platform, lastSeenAt: new Date(), ...link },
      }),
    ]);
  }
}
