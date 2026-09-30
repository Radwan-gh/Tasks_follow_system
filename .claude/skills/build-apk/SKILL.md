---
name: build-apk
description: Build a new Android release APK of apps/mobile locally with Gradle and save it to apps/mobile/apk/. Use when the user asks to build, make or rebuild the APK / Android app / mobile app, or wants a universal or smaller APK variant, or to install the fresh build on a connected phone.
---

# Build the Android APK

Runs every step of `apps/mobile/BUILD_APK.md` through one script,
`scripts/build-apk.ps1`. That guide is the source of truth; if a step here and
the guide disagree, fix the script to match the guide.

## 1. Pick the variant

Default to `arm64` unless the user asks for another variant. Don't ask if they
didn't say, but mention in the final report that `universal` exists for a phone
that can't install it (`INSTALL_FAILED_NO_MATCHING_ABIS`, an old 32-bit phone).

| `-Variant` | Size | Use when |
|---|---|---|
| `arm64` | ~46 MB | Default. Virtually every current phone. |
| `universal` | ~99 MB | "Universal", "works on any phone", or an emulator / old 32-bit phone. |
| `arm32-64` | ~59 MB | Smaller, but also works on old 32-bit phones. |
| `arm64-min` | ~34 MB | Explicitly asked to shrink further. R8 can break runtime code, so it **must be tested on a phone** (sign-in, a board, a card, notifications) before sharing. Say so. |

Add `-Install` only when the user asks to install on a connected phone.

If the user's change is JS-only, point out that an OTA update may be enough
(`apps/mobile/CHEATSHEET.md` §5). Build anyway if they asked for an APK.

## 2. Run the script in the background

The first build takes ~8 minutes, later ones ~1 minute. Run it with the
PowerShell tool, `run_in_background: true`, and a timeout of 3600000:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<repo>\.claude\skills\build-apk\scripts\build-apk.ps1" -Variant arm64
```

Use the absolute repo path. Don't `Set-Location` into `apps/mobile/android`
first: a shell sitting inside `android/` locks it and makes `expo prebuild`
fail with `EBUSY`.

Tell the user the build is running, then wait for the completion notification.
Don't poll it.

## 3. Report the result

Read the task output. On success the last lines are:

```
APK_PATH=...\apps\mobile\apk\tasks_1.1.0_1.1.0_arm64.apk
APK_SIZE_MB=46.2
APK_VERSION=1.1.0
APK_RUNTIME_VERSION=1.1.0
APK_VARIANT=arm64
API_ENV=.env.production
```

Report the path, size, app version, runtime version, and that the production
API URL is baked in. An OTA update reaches this APK only if it was published
for the same runtime version.
Then give the install command and how to check the install:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "<APK_PATH>"
```

To check the install, open **حسابي** and scroll to the bottom. The footer should
show «الإصدار {version}». A red «التحديثات التلقائية غير مفعّلة في هذه النسخة»
means OTA updates are broken in this build.

On failure the script prints a `FAILED:` line. Match it against the
Troubleshooting table in `apps/mobile/BUILD_APK.md`, and read the Gradle log
(its path is printed at the build step) for the actual error. Fix what you can,
such as a stale `tsconfig.tsbuildinfo` or a locked `android/`, and rerun. For
missing machine setup (JDK, `ANDROID_HOME`, `google-services.json`), tell the
user which setup step of BUILD_APK.md is needed.

## What the script guarantees

- It checks the preflight items: JDK 17, `ANDROID_HOME`, `google-services.json`.
- It builds the shared packages before prebuild.
- If a clean `expo prebuild` fails (usually `EBUSY`), it retries with `--no-clean`.
- It re-applies the Gradle memory fix after every prebuild.
- It forces the JS bundle to rebuild (`--rerun`) so a cached bundle is never
  shipped, and refuses to copy the APK unless the log shows
  `env: load .env.production`.
- It names the output `tasks_{app_version}_{runtime_version}[_{variant}].apk`
  in `apps/mobile/apk/` (gitignored). The app version comes from `expo.version`
  in `app.json`. The runtime version is the resolved `expo_runtime_version` that
  prebuild writes to `android/app/src/main/res/values/strings.xml`, because
  `app.json` only holds a policy for it. Rebuilding the same versions replaces
  the file.
