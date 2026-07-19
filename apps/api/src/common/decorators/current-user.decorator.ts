import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@app/types";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
