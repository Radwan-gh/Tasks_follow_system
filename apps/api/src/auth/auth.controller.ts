import { Body, Controller, Get, HttpCode, NotFoundException, Post, UseGuards } from "@nestjs/common";
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("register")
  register(@Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest) {
    return this.auth.register(body);
  }

  @Post("login")
  login(@Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest) {
    return this.auth.login(body);
  }

  @Post("refresh")
  refresh(@Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest) {
    await this.auth.logout(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!record) throw new NotFoundException();
    return {
      id: record.id,
      email: record.email,
      displayName: record.displayName,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
