import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  RegisterPushDeviceRequestSchema,
  SendPushRequestSchema,
  type RegisterPushDeviceRequest,
  type SendPushRequest,
} from "@app/types";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { CanSendPushGuard } from "../../common/guards/can-send-push.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { zodArrayRef, zodRef } from "../../swagger/zod-ref";
import { PushDevicesService } from "./push-devices.service";
import { PushSenderService } from "./push-sender.service";

/**
 * `POST /devices` — the one unauthenticated push endpoint. The app calls it on
 * every launch so anonymous installs are reachable too. It can only register a
 * token, never send, so leaving it open exposes nothing.
 */
@ApiTags("Push")
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: PushDevicesService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: "Register this app install's push token (no sign-in required)" })
  @ApiBody({ schema: zodRef("RegisterPushDeviceRequest") })
  @ApiResponse({ status: 204, description: "Registered" })
  async register(@Body(new ZodValidationPipe(RegisterPushDeviceRequestSchema)) body: RegisterPushDeviceRequest) {
    await this.devices.registerAnonymous(body);
  }
}

/** `/push/*` — the «إرسال إشعار» screen. ADMIN, or a user granted `canSendNotifications`. */
@ApiTags("Push")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CanSendPushGuard)
@Controller("push")
export class PushController {
  constructor(
    private readonly devices: PushDevicesService,
    private readonly sender: PushSenderService,
  ) {}

  @Get("devices")
  @ApiOperation({ summary: "List every registered install, signed in or anonymous" })
  @ApiResponse({ status: 200, schema: zodArrayRef("PushDevice") })
  @ApiResponse({ status: 403, description: "Requires ADMIN or canSendNotifications" })
  list() {
    return this.devices.listAll();
  }

  @Post("send")
  @HttpCode(200)
  @ApiOperation({ summary: "Send a push notification to all installs, specific deviceIds, or specific users" })
  @ApiBody({ schema: zodRef("SendPushRequest") })
  @ApiResponse({ status: 200, schema: zodRef("SendPushResponse") })
  @ApiResponse({ status: 403, description: "Requires ADMIN or canSendNotifications" })
  @ApiResponse({ status: 503, description: "Firebase credentials are not configured on the server" })
  send(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SendPushRequestSchema)) body: SendPushRequest,
  ) {
    return this.sender.send(user.id, body);
  }
}
