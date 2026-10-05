import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "../decorators/current-user.decorator";
import { BoardsService } from "../../boards/boards.service";

/**
 * Requires the authenticated user to be allowed to oversee every board
 * («المتابعة»): an ADMIN, or a user an admin granted `canViewAllBoards`. Must
 * run after JwtAuthGuard: `@UseGuards(JwtAuthGuard, SupervisorGuard)`.
 *
 * Delegates to `BoardsService.isSupervisor` — the same check the supervision
 * fallback in `assertMembership` uses — which reads role and flag from the
 * database rather than the JWT, so a revoke takes effect on the next request.
 */
@Injectable()
export class SupervisorGuard implements CanActivate {
  constructor(private readonly boards: BoardsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const authUser: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!authUser || !(await this.boards.isSupervisor(authUser.id))) {
      throw new ForbiddenException("Permission to view all boards required");
    }
    return true;
  }
}
