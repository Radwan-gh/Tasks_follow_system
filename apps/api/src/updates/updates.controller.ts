import { BadRequestException, Controller, Get, Headers, Query, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import * as path from "node:path";
import type { Request, Response } from "express";
import { ExpoPlatform, UpdatesService } from "./updates.service";

const PROTOCOL_VERSION = "1";

/**
 * Self-hosted implementation of the expo-updates v1 manifest protocol — see
 * `docs/12-mobile-app.md` §"تحديثات OTA". Deliberately unauthenticated: the
 * native updates client fetches this before any app code (and therefore any
 * login) has run, and it only ever serves JS bundles/assets, not user data.
 * `apps/mobile/app.json`'s `updates.url` must point at `GET /updates/manifest`.
 *
 * Excluded from the OpenAPI docs: this implements expo-updates' raw
 * multipart/binary wire protocol, not the app's JSON/Zod contract surface —
 * documenting it with fabricated schemas would be misleading.
 */
@ApiExcludeController()
@Controller("updates")
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  @Get("manifest")
  async manifest(
    @Headers("expo-protocol-version") protocolVersion: string | undefined,
    @Headers("expo-platform") platformHeader: string | undefined,
    @Headers("expo-runtime-version") runtimeVersion: string | undefined,
    @Headers("expo-current-update-id") currentUpdateId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (protocolVersion !== PROTOCOL_VERSION) {
      throw new BadRequestException('Missing or unsupported "expo-protocol-version" header; expected "1".');
    }
    if (platformHeader !== "ios" && platformHeader !== "android") {
      throw new BadRequestException('Missing or invalid "expo-platform" header; expected "ios" or "android".');
    }
    if (!runtimeVersion) {
      throw new BadRequestException('Missing "expo-runtime-version" header.');
    }
    const platform: ExpoPlatform = platformHeader;

    const { dir: bundleDir, timestamp } = await this.updates.latestBundleFor(runtimeVersion);
    const { raw, parsed } = await this.updates.loadMetadata(bundleDir);
    const id = this.updates.updateIdFromMetadata(raw);

    if (currentUpdateId === id) {
      sendMultipartPart(res, "directive", { type: "noUpdateAvailable" });
      return;
    }

    const platformMeta = parsed.fileMetadata[platform];
    if (!platformMeta) {
      throw new BadRequestException(`No published assets for platform "${platform}".`);
    }

    const publicBaseUrl = process.env.EXPO_UPDATES_PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
    const buildAssetUrl = (relativeAssetPath: string) =>
      `${publicBaseUrl}/updates/assets?runtimeVersion=${encodeURIComponent(runtimeVersion)}` +
      `&timestamp=${encodeURIComponent(timestamp)}&platform=${platform}&asset=${encodeURIComponent(relativeAssetPath)}`;

    const launchAssetPath = this.updates.resolveAssetPath(bundleDir, platformMeta.bundle);
    const launchAssetHash = await this.updates.hashAsset(launchAssetPath);
    const launchAsset = {
      key: launchAssetHash.md5Hex,
      hash: launchAssetHash.sha256Base64Url,
      contentType: "application/javascript",
      url: buildAssetUrl(platformMeta.bundle),
    };

    const assets = await Promise.all(
      platformMeta.assets.map(async (asset) => {
        const absolutePath = this.updates.resolveAssetPath(bundleDir, asset.path);
        const hash = await this.updates.hashAsset(absolutePath);
        return {
          key: hash.md5Hex,
          hash: hash.sha256Base64Url,
          contentType: this.updates.contentTypeFor(asset.ext),
          url: buildAssetUrl(asset.path),
        };
      }),
    );

    const manifest = {
      id,
      createdAt: new Date(Number(timestamp)).toISOString(),
      runtimeVersion,
      launchAsset,
      assets,
      metadata: {},
      extra: {},
    };

    sendMultipartPart(res, "manifest", manifest);
  }

  @Get("assets")
  async asset(
    @Query("runtimeVersion") runtimeVersion: string | undefined,
    @Query("timestamp") timestamp: string | undefined,
    @Query("platform") platformParam: string | undefined,
    @Query("asset") assetRelativePath: string | undefined,
    @Res() res: Response,
  ) {
    if (!runtimeVersion || !timestamp || !assetRelativePath) {
      throw new BadRequestException('Missing "runtimeVersion", "timestamp", or "asset" query parameter.');
    }
    if (platformParam !== "ios" && platformParam !== "android") {
      throw new BadRequestException('Missing or invalid "platform" query parameter.');
    }

    const bundleDir = this.updates.bundleDirFor(runtimeVersion, timestamp);
    const absoluteAssetPath = this.updates.resolveAssetPath(bundleDir, assetRelativePath);
    if (!existsSync(absoluteAssetPath)) {
      throw new BadRequestException("Asset not found.");
    }

    const { parsed } = await this.updates.loadMetadata(bundleDir);
    const platformMeta = parsed.fileMetadata[platformParam as ExpoPlatform];
    const isLaunchAsset = platformMeta?.bundle === assetRelativePath;
    const ext = path.extname(assetRelativePath).slice(1);
    const contentType = isLaunchAsset ? "application/javascript" : this.updates.contentTypeFor(ext);

    const data = await fs.readFile(absoluteAssetPath);
    res.status(200);
    res.setHeader("content-type", contentType);
    res.send(data);
  }
}

function sendMultipartPart(res: Response, partName: "manifest" | "directive", payload: unknown): void {
  const boundary = `expo-updates-${randomBytes(12).toString("hex")}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${partName}"\r\n` +
    `Content-Type: application/json; charset=utf-8\r\n\r\n` +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--\r\n`;

  res.status(200);
  res.setHeader("expo-protocol-version", PROTOCOL_VERSION);
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("cache-control", "private, max-age=0");
  res.setHeader("content-type", `multipart/mixed; boundary=${boundary}`);
  res.send(Buffer.from(body, "utf-8"));
}
