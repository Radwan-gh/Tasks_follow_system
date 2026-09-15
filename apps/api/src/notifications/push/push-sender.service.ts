import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { SendPushRequest, SendPushResponse } from "@app/types";
import { FcmService } from "./fcm.service";
import { PushDevicesService } from "./push-devices.service";

/**
 * Manual pushes composed in the app's «إرسال إشعار» screen. Unlike
 * `PushDispatcherService` these have no `Notification` row behind them — they
 * are not about a card, and they may target anonymous installs that have no
 * user to own a row — so they are sent immediately rather than swept.
 */
@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);

  constructor(
    private readonly fcm: FcmService,
    private readonly devices: PushDevicesService,
  ) {}

  async send(senderId: string, request: SendPushRequest): Promise<SendPushResponse> {
    // Fail loudly: a silent `delivered: 0` would look like "no devices" when the
    // real problem is missing Firebase credentials on the server.
    if (!this.fcm.isEnabled) {
      throw new ServiceUnavailableException("Push notifications are not configured on the server");
    }

    const tokens = await this.devices.tokensForTarget(request.target);
    const results = await this.fcm.send(
      tokens.map((token) => ({ token, title: request.title, body: request.body, data: {} })),
    );
    await this.devices.removeDeadTokens(results.filter((r) => r.unregistered).map((r) => r.token));

    const delivered = results.filter((r) => r.ok).length;
    this.logger.log(
      `Manual push by ${senderId} (target: ${request.target.kind}) → ${delivered}/${tokens.length} delivered`,
    );
    return { targeted: tokens.length, delivered };
  }
}
