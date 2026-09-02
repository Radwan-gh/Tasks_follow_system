import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  AdminSetPasswordRequestSchema,
  CreateUserRequestSchema,
  ListUsersQuerySchema,
  UpdateUserRoleRequestSchema,
  UpdateUserStatusRequestSchema,
  type AdminResetPasswordResponse,
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
import { zodRef } from "../swagger/zod-ref";
import { UsersService } from "./users.service";

@ApiTags("Admin Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: "List user accounts (search + pagination)" })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @ApiResponse({ status: 200, schema: zodRef("AdminUserList") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  list(@Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Provision a new user account (no public self-registration)" })
  @ApiBody({ schema: zodRef("CreateUserRequest") })
  @ApiResponse({ status: 201, schema: zodRef("AdminUser") })
  @ApiResponse({ status: 400, description: "Email already in use" })
  create(@Body(new ZodValidationPipe(CreateUserRequestSchema)) body: CreateUserRequest) {
    return this.users.create(body);
  }

  @Patch(":id/password")
  @ApiOperation({ summary: "Set a user's password" })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiBody({ schema: zodRef("AdminSetPasswordRequest") })
  @ApiResponse({ status: 200, schema: zodRef("AdminUser") })
  setPassword(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminSetPasswordRequestSchema)) body: AdminSetPasswordRequest,
  ) {
    return this.users.setPassword(id, body.password);
  }

  @Post(":id/reset-password")
  @ApiOperation({ summary: "Generate a one-time temporary password for a user" })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiResponse({ status: 201, schema: zodRef("AdminResetPasswordResponse") })
  async resetPassword(@Param("id") id: string): Promise<AdminResetPasswordResponse> {
    const temporaryPassword = await this.users.resetPassword(id);
    return { temporaryPassword };
  }

  @Patch(":id/role")
  @ApiOperation({ summary: "Change a user's role" })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiBody({ schema: zodRef("UpdateUserRoleRequest") })
  @ApiResponse({ status: 200, schema: zodRef("AdminUser") })
  updateRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateUserRoleRequestSchema)) body: UpdateUserRoleRequest,
  ) {
    return this.users.updateRole(user.id, id, body.role);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Activate or deactivate a user account" })
  @ApiParam({ name: "id", description: "User ID" })
  @ApiBody({ schema: zodRef("UpdateUserStatusRequest") })
  @ApiResponse({ status: 200, schema: zodRef("AdminUser") })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateUserStatusRequestSchema)) body: UpdateUserStatusRequest,
  ) {
    return this.users.updateStatus(user.id, id, body.isActive);
  }
}
