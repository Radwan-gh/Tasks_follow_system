#!/usr/bin/env node
// Publishes an OTA update to the self-hosted update server in `apps/api`
// (see UpdatesController / docs/12-mobile-app.md) — the self-hosted
// counterpart to `eas update`. Exports the current JS bundle with
// `expo export`, then copies it into the API's `update-bundles/<runtimeVersion>/<timestamp>/`
// so `GET /updates/manifest` picks it up as the latest update.
//
// Usage: pnpm --filter @app/mobile publish-update
// Requires EXPO_UPDATES_STORAGE_DIR to match apps/api's setting if you
// override it there (defaults to apps/api/update-bundles on both sides).

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const appJson = JSON.parse(readFileSync(join(mobileRoot, "app.json"), "utf-8"));
if (appJson.expo?.runtimeVersion?.policy !== "appVersion") {
  console.error(
    'This script assumes app.json\'s "runtimeVersion.policy" is "appVersion" (runtimeVersion === expo.version). ' +
      "Update it if that policy has changed.",
  );
  process.exit(1);
}
const runtimeVersion = appJson.expo.version;
if (!runtimeVersion) {
  console.error('app.json is missing "expo.version".');
  process.exit(1);
}

const storageRoot = process.env.EXPO_UPDATES_STORAGE_DIR ?? join(mobileRoot, "..", "api", "update-bundles");
const timestamp = String(Date.now());
const destination = join(storageRoot, runtimeVersion, timestamp);

const tmpDir = mkdtempSync(join(tmpdir(), "expo-publish-"));
try {
  console.log(`Exporting JS bundle (runtimeVersion ${runtimeVersion})...`);
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["expo", "export", "--platform", "all", "--output-dir", tmpDir], {
    cwd: mobileRoot,
    stdio: "inherit",
  });

  console.log(`Copying export to ${destination} ...`);
  cpSync(tmpDir, destination, { recursive: true });
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log("\nPublished.");
console.log(`  runtimeVersion: ${runtimeVersion}`);
console.log(`  timestamp:      ${timestamp}`);
console.log(`  stored at:      ${destination}`);
console.log(
  "\nAny app already pointed at this server's /updates/manifest will pick this up the next\n" +
    "time it checks (cold start, or app foreground — see src/lib/updates.ts).",
);
