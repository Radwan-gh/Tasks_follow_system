import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "../decorators/current-user.decorator";

/**
 * Requires the authenticated user to be a global ADMIN. Must run after
 * JwtAuthGuard, which populates request.user: use
 * `@UseGuards(JwtAuthGuard, AdminGuard)`.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (user?.role !== "ADMIN") throw new ForbiddenException("Admin access required");
    return true;
  }
}
