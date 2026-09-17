import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@app/types";

export interface AuthUser {
  id: string;
  /** From the JWT claim; empty string on tokens issued before username login. Identify users by `id`. */
  username: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
