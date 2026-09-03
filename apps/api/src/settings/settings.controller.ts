import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UpdateAppSettingsRequestSchema, type UpdateAppSettingsRequest } from "@app/types";
import { AdminGuard } from "../common/guards/admin.guard";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodRef } from "../swagger/zod-ref";
import { SettingsService } from "./settings.service";

@ApiTags("Settings")
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("settings")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Read global app settings (currency symbol) — any authenticated user" })
  @ApiResponse({ status: 200, schema: zodRef("AppSettings") })
  get() {
    return this.settings.get();
  }

  @Patch("admin/settings")
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: "Update global app settings (currency symbol) — admin-only" })
  @ApiBody({ schema: zodRef("UpdateAppSettingsRequest") })
  @ApiResponse({ status: 200, schema: zodRef("AppSettings") })
  @ApiResponse({ status: 403, description: "Requires ADMIN role" })
  update(@Body(new ZodValidationPipe(UpdateAppSettingsRequestSchema)) body: UpdateAppSettingsRequest) {
    return this.settings.update(body);
  }
}
