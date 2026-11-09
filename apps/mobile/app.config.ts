import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * `app.json` is the app's config; this file only layers the **preview**
 * variant on top of it, and only when `APP_VARIANT=preview` is set. With the
 * variable unset — every production APK build and every production OTA
 * publish — the config passes through untouched.
 *
 * The preview build is a second app on the phone, for trying a branch out
 * before it reaches anyone:
 *
 * - its own package id, so it installs beside the real «غِراس» instead of
 *   replacing it, and a name that says which one is open;
 * - its own OTA channel, `preview`, so `publish-ota.ps1 -Channel preview`
 *   reaches this APK alone and never the people using the app;
 * - the same runtime version, API and signing certificate as production.
 *
 * Push is not wired for it: `google-services.json` lists only the production
 * package, and the Firebase Gradle plugin refuses a package it doesn't list.
 * So the preview build leaves Firebase out unless `PREVIEW_GOOGLE_SERVICES`
 * points at a `google-services.json` that also lists
 * `com.tasksfollow.app.preview`. Without it, registering for push fails and
 * is logged (`use-push-registration.ts`); everything else works.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.APP_VARIANT !== "preview") return base;

  return {
    ...base,
    name: "غِراس تجريبي",
    scheme: "tasksfollow-preview",
    android: {
      ...base.android,
      package: "com.tasksfollow.app.preview",
      googleServicesFile: process.env.PREVIEW_GOOGLE_SERVICES || undefined,
    },
    updates: {
      ...base.updates,
      requestHeaders: {
        ...base.updates?.requestHeaders,
        "expo-channel-name": "preview",
      },
    },
  };
};
