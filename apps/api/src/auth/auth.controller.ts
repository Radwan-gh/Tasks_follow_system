import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  ChangePasswordRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  UpdateProfileRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type RefreshRequest,
  type UpdateProfileRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodRef } from "../swagger/zod-ref";
import { AuthService } from "./auth.service";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @ApiOperation({ summary: "Log in with username and password" })
  @ApiBody({ schema: zodRef("LoginRequest") })
  @ApiResponse({ status: 200, schema: zodRef("AuthResponse") })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  login(@Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest) {
    return this.auth.login(body);
  }

  @Post("refresh")
  @ApiOperation({ summary: "Rotate a refresh token for a new access/refresh token pair" })
  @ApiBody({ schema: zodRef("RefreshRequest") })
  @ApiResponse({ status: 200, schema: zodRef("AuthResponse") })
  @ApiResponse({ status: 401, description: "Refresh token invalid, expired, or already used" })
  refresh(@Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke a refresh token" })
  @ApiBody({ schema: zodRef("RefreshRequest") })
  @ApiResponse({ status: 204, description: "Revoked" })
  async logout(@Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest) {
    await this.auth.logout(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("change-password")
  @HttpCode(204)
  @ApiOperation({ summary: "Change the current user's own password" })
  @ApiBody({ schema: zodRef("ChangePasswordRequest") })
  @ApiResponse({ status: 204, description: "Changed" })
  @ApiResponse({ status: 400, description: "Current password incorrect" })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema)) body: ChangePasswordRequest,
  ) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "Get the current logged-in user" })
  @ApiResponse({ status: 200, schema: zodRef("User") })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getProfile(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch("me")
  @ApiOperation({ summary: "Edit the current user's own profile (display name)" })
  @ApiBody({ schema: zodRef("UpdateProfileRequest") })
  @ApiResponse({ status: 200, schema: zodRef("User") })
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema)) body: UpdateProfileRequest,
  ) {
    return this.auth.updateProfile(user.id, body);
  }
}
