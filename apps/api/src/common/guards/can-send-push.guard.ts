import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { canSendPush } from "@app/types";
import type { AuthUser } from "../decorators/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Requires the authenticated user to be allowed to send push notifications:
 * an ADMIN, or a user an admin granted `canSendNotifications`. Must run after
 * JwtAuthGuard: `@UseGuards(JwtAuthGuard, CanSendPushGuard)`.
 *
 * Reads role and flag from the database rather than the JWT, so a revoked
 * permission (or a demotion) takes effect on the very next request.
 */
@Injectable()
export class CanSendPushGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const authUser: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    const user = authUser
      ? await this.prisma.user.findUnique({
          where: { id: authUser.id },
          select: { role: true, canSendNotifications: true, isActive: true },
        })
      : null;
    if (!user?.isActive || !canSendPush(user)) {
      throw new ForbiddenException("Permission to send notifications required");
    }
    return true;
  }
}
