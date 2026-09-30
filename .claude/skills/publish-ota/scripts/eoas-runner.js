// Package runner for `eoas publish --packageRunner eoas-runner` (see
// publish-ota.ps1). eoas spawns `<runner> expo export ...` and
// `<runner> expo config ...` through it; this forwards each call to
// `pnpm exec`, the runner eoas would otherwise pick from `packageManager`.
//
// Why it exists: on Windows `expo export` writes asset paths into
// dist/metadata.json with backslashes ("assets\<hash>"). eoas uploads those
// names as-is, and the xprem server rejects them ("invalid file name: must not
// contain '\' characters"). metadata.json is also what the server builds the
// phone-facing manifest from, so the paths must really be forward slashes, not
// just pass validation. Rewriting them after the export, before eoas reads the
// file, fixes both.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
// shell: Node refuses to spawn pnpm.cmd without one. The args eoas passes carry
// no spaces or shell metacharacters.
const result = spawnSync(['pnpm', 'exec', ...args].join(' '), { stdio: 'inherit', shell: true });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

if (args[0] === 'expo' && args[1] === 'export') {
  const flag = args.indexOf('--output-dir');
  const outDir = flag >= 0 ? args[flag + 1] : 'dist';
  const file = path.join(outDir, 'metadata.json');
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  const toPosix = (p) => p.replace(/\\/g, '/');
  for (const platform of Object.values(metadata.fileMetadata ?? {})) {
    if (platform.bundle) platform.bundle = toPosix(platform.bundle);
    for (const asset of platform.assets ?? []) asset.path = toPosix(asset.path);
  }
  fs.writeFileSync(file, JSON.stringify(metadata));
  // stderr: eoas parses the stdout of `expo config`, keep ours off it.
  console.error('eoas-runner: normalised asset paths in metadata.json to forward slashes');
}
