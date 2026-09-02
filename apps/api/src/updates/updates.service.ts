import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export type ExpoPlatform = "ios" | "android";

interface FileMetadataEntry {
  path: string;
  ext: string;
}

interface PlatformMetadata {
  bundle: string;
  assets: FileMetadataEntry[];
}

interface UpdateMetadataFile {
  version: number;
  bundler: string;
  fileMetadata: Partial<Record<ExpoPlatform, PlatformMetadata>>;
}

// Only path segments a publish run actually produces (a semver-ish runtime
// version, a Date.now() timestamp) — anything else is a traversal attempt.
const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  xml: "application/xml",
  json: "application/json",
  hbc: "application/javascript",
  bundle: "application/javascript",
  js: "application/javascript",
};

/**
 * Serves OTA update bundles (`expo export` output, see
 * `apps/mobile/scripts/publish-update.mjs`) directly from disk, implementing
 * the parts of the expo-updates v1 manifest protocol this app needs — an
 * alternative to EAS Update's hosted version of the same protocol. See
 * `docs/12-mobile-app.md`. Deliberately out of scope: code signing (the
 * client only requires it if `app.json` configures a signing certificate,
 * which this project doesn't) and rollback directives.
 */
@Injectable()
export class UpdatesService {
  private readonly storageRoot = path.resolve(
    process.env.EXPO_UPDATES_STORAGE_DIR ?? path.join(process.cwd(), "update-bundles"),
  );

  private assertSafeSegment(value: string, label: string): void {
    if (!SAFE_SEGMENT.test(value)) throw new BadRequestException(`Invalid ${label}.`);
  }

  bundleDirFor(runtimeVersion: string, timestamp: string): string {
    this.assertSafeSegment(runtimeVersion, "runtimeVersion");
    this.assertSafeSegment(timestamp, "timestamp");
    return path.join(this.storageRoot, runtimeVersion, timestamp);
  }

  /** Newest published bundle directory for a runtime version, plus its timestamp. */
  async latestBundleFor(runtimeVersion: string): Promise<{ dir: string; timestamp: string }> {
    this.assertSafeSegment(runtimeVersion, "runtimeVersion");
    const runtimeDir = path.join(this.storageRoot, runtimeVersion);
    if (!existsSync(runtimeDir)) {
      throw new NotFoundException(`No published update for runtime version "${runtimeVersion}".`);
    }

    const entries = await fs.readdir(runtimeDir, { withFileTypes: true });
    const timestamps = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => Number(b) - Number(a));
    if (timestamps.length === 0) {
      throw new NotFoundException(`No published update for runtime version "${runtimeVersion}".`);
    }

    const timestamp = timestamps[0];
    return { dir: path.join(runtimeDir, timestamp), timestamp };
  }

  /** Raw file text (for hashing into a stable update id) and the parsed, path-normalized metadata. */
  async loadMetadata(bundleDir: string): Promise<{ raw: string; parsed: UpdateMetadataFile }> {
    const metadataPath = path.join(bundleDir, "metadata.json");
    if (!existsSync(metadataPath)) {
      throw new NotFoundException("Published update is missing metadata.json.");
    }
    const raw = await fs.readFile(metadataPath, "utf-8");
    const parsed = JSON.parse(raw) as UpdateMetadataFile;

    // `expo export` writes OS path separators into metadata.json. A bundle
    // published from a Windows dev machine but served from a Linux host
    // would otherwise embed backslashes in both file paths and asset URLs.
    for (const platformMeta of Object.values(parsed.fileMetadata)) {
      if (!platformMeta) continue;
      platformMeta.bundle = platformMeta.bundle.replace(/\\/g, "/");
      for (const asset of platformMeta.assets) asset.path = asset.path.replace(/\\/g, "/");
    }

    return { raw, parsed };
  }

  updateIdFromMetadata(raw: string): string {
    const hex = createHash("sha256").update(raw).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  contentTypeFor(ext: string): string {
    return CONTENT_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
  }

  /** Resolves an asset's on-disk path, rejecting anything that would escape `bundleDir`. */
  resolveAssetPath(bundleDir: string, relativeAssetPath: string): string {
    if (relativeAssetPath.includes("..") || path.isAbsolute(relativeAssetPath)) {
      throw new BadRequestException("Invalid asset path.");
    }
    const resolvedBundleDir = path.resolve(bundleDir);
    const resolved = path.resolve(resolvedBundleDir, relativeAssetPath);
    if (resolved !== resolvedBundleDir && !resolved.startsWith(resolvedBundleDir + path.sep)) {
      throw new BadRequestException("Invalid asset path.");
    }
    return resolved;
  }

  async hashAsset(filePath: string): Promise<{ sha256Base64Url: string; md5Hex: string }> {
    const data = await fs.readFile(filePath);
    const sha256Base64Url = createHash("sha256")
      .update(data)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const md5Hex = createHash("md5").update(data).digest("hex");
    return { sha256Base64Url, md5Hex };
  }
}
