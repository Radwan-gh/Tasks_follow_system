// Metro has to be told about the monorepo explicitly: by default it only
// watches this app's folder, so edits in `packages/*` would neither trigger a
// reload nor resolve at all.
//
// Note we deliberately leave `disableHierarchicalLookup` at its default
// (false). Expo's monorepo guide turns it off for npm/yarn workspaces, but
// pnpm stores real packages under `node_modules/.pnpm` and links to them —
// hierarchical lookup is what lets those links resolve.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
