import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  RegisterPushDeviceRequestSchema,
  UpdateNotificationPrefsRequestSchema,
  type RegisterPushDeviceRequest,
  type UpdateNotificationPrefsRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodRef } from "../swagger/zod-ref";
import { NotificationsService } from "./notifications.service";
import { PushDevicesService } from "./push/push-devices.service";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly devices: PushDevicesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List the current user's notifications, newest first" })
  @ApiResponse({ status: 200, schema: zodRef("NotificationsResponse") })
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Patch(":id/read")
  @HttpCode(204)
  @ApiOperation({ summary: "Mark a notification as read" })
  @ApiParam({ name: "id", description: "Notification ID" })
  @ApiResponse({ status: 204, description: "Marked read" })
  async markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.notifications.markRead(user.id, id);
  }

  @Post("read-all")
  @HttpCode(204)
  @ApiOperation({ summary: "Mark all of the current user's notifications as read" })
  @ApiResponse({ status: 204, description: "Marked read" })
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id);
  }

  @Post("devices")
  @HttpCode(204)
  @ApiOperation({ summary: "Register this install's push token and link it to the current user" })
  @ApiBody({ schema: zodRef("RegisterPushDeviceRequest") })
  @ApiResponse({ status: 204, description: "Registered" })
  async registerDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(RegisterPushDeviceRequestSchema)) body: RegisterPushDeviceRequest,
  ) {
    await this.devices.register(user.id, body);
  }

  @Delete("devices/:deviceId")
  @HttpCode(204)
  @ApiOperation({ summary: "Unlink this install from the current user (called on logout); the token is kept" })
  @ApiParam({ name: "deviceId", description: "The app install's deviceId" })
  @ApiResponse({ status: 204, description: "Unlinked" })
  async unlinkDevice(@CurrentUser() user: AuthUser, @Param("deviceId") deviceId: string) {
    await this.devices.unlink(user.id, deviceId);
  }
}

/** `/me/notification-prefs` — `account.tsx`'s "الإشعارات" section (`design-prompt-group-3.md` §3a-2). */
@ApiTags("Notification Preferences")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("me/notification-prefs")
export class NotificationPrefsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's notification preferences" })
  @ApiResponse({ status: 200, schema: zodRef("NotificationPrefs") })
  get(@CurrentUser() user: AuthUser) {
    return this.notifications.getPrefs(user.id);
  }

  @Patch()
  @ApiOperation({ summary: "Partially update the current user's notification preferences" })
  @ApiBody({ schema: zodRef("UpdateNotificationPrefsRequest") })
  @ApiResponse({ status: 200, schema: zodRef("NotificationPrefs") })
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateNotificationPrefsRequestSchema)) body: UpdateNotificationPrefsRequest,
  ) {
    return this.notifications.updatePrefs(user.id, body);
  }
}
