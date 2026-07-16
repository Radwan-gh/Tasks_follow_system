#!/usr/bin/env node
// Bumps the SemVer version in the root package.json and every workspace
// package.json in lockstep (this repo uses one unified version across
// apps/* and packages/* rather than independently versioned packages).
//
// Usage: node scripts/bump-version.mjs <major|minor|patch>

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Lists apps/*/package.json and packages/*/package.json without relying on
// fs.globSync, which requires Node 22+ (this repo supports Node >=20).
function workspacePackageJsonPaths(repoRoot, groupDir) {
  const groupPath = path.join(repoRoot, groupDir);
  if (!existsSync(groupPath)) return [];
  return readdirSync(groupPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(groupPath, entry.name, 'package.json'))
    .filter((pkgPath) => existsSync(pkgPath));
}

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const bumpType = process.argv[2];
if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('Usage: node scripts/bump-version.mjs <major|minor|patch>');
  process.exit(1);
}

const rootPkgPath = path.join(repoRoot, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));

const currentVersion = rootPkg.version ?? '0.0.0';
const [major, minor, patch] = currentVersion.split('.').map(Number);

let nextVersion;
if (bumpType === 'major') nextVersion = `${major + 1}.0.0`;
else if (bumpType === 'minor') nextVersion = `${major}.${minor + 1}.0`;
else nextVersion = `${major}.${minor}.${patch + 1}`;

const pkgPaths = [
  rootPkgPath,
  ...workspacePackageJsonPaths(repoRoot, 'apps'),
  ...workspacePackageJsonPaths(repoRoot, 'packages'),
];

for (const pkgPath of pkgPaths) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(nextVersion);
