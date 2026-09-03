import { Injectable } from "@nestjs/common";
import type { AppSettings, UpdateAppSettingsRequest } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";

/** The single global-settings row always has this fixed id — see `AppSettings` in `schema.prisma`. */
const SETTINGS_ID = "global";

/**
 * Single-row global settings (§3c-1 "إعدادات عامة"): currently just the
 * currency symbol shown next to every cost amount app-wide. Readable by any
 * authenticated user (the symbol renders on every board a member can see);
 * writable only by an ADMIN, via `PATCH /admin/settings`.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AppSettings> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
    return { currencySymbol: row.currencySymbol };
  }

  async update(input: UpdateAppSettingsRequest): Promise<AppSettings> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, currencySymbol: input.currencySymbol },
      update: { currencySymbol: input.currencySymbol },
    });
    return { currencySymbol: row.currencySymbol };
  }
}
