import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import {
  ListUsersQuerySchema,
  UpdateUserRoleRequestSchema,
  UpdateUserStatusRequestSchema,
  type ListUsersQuery,
  type UpdateUserRoleRequest,
  type UpdateUserStatusRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { AdminGuard } from "../common/guards/admin.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Patch(":id/role")
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateUserRoleRequestSchema)) body: UpdateUserRoleRequest,
  ) {
    return this.users.updateRole(user.id, id, body.role);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateUserStatusRequestSchema)) body: UpdateUserStatusRequest,
  ) {
    return this.users.updateStatus(user.id, id, body.isActive);
  }
}
