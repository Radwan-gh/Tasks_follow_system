import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  AdminSetPasswordRequestSchema,
  CreateUserRequestSchema,
  ListUsersQuerySchema,
  UpdateUserRoleRequestSchema,
  UpdateUserStatusRequestSchema,
  type AdminSetPasswordRequest,
  type CreateUserRequest,
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

  @Post()
  create(@Body(new ZodValidationPipe(CreateUserRequestSchema)) body: CreateUserRequest) {
    return this.users.create(body);
  }

  @Patch(":id/password")
  setPassword(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminSetPasswordRequestSchema)) body: AdminSetPasswordRequest,
  ) {
    return this.users.setPassword(id, body.password);
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
