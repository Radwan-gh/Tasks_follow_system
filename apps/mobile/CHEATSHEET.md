# Mobile app cheatsheet

Quick commands for running `apps/mobile` locally and producing an APK. Run
everything from the repo root unless noted. Details/rationale live in
`docs/12-mobile-app.md` (Arabic).

## 0. One-time setup

```bash
pnpm install

# Build workspace deps the mobile app imports at runtime
pnpm --filter @app/types build
pnpm --filter @app/api-client build

cp apps/mobile/.env.example apps/mobile/.env
```

Edit `apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to your machine's **LAN
IP**, not `localhost` — a phone/emulator can't reach your laptop's localhost:

```
EXPO_PUBLIC_API_URL="http://192.168.1.10:3000"
```

Find your LAN IP:
```bash
# Windows
ipconfig            # look for IPv4 Address
```

Make sure the API is actually running and reachable at that address:
```bash
pnpm --filter @app/api dev   # or: pnpm dev (runs api + web together)
```

## 1. Run on Expo locally (Expo Go — fastest, no native build)

```bash
pnpm --filter @app/mobile dev      # same as: expo start
```

- Scan the QR code with the Expo Go app (phone must be on the same Wi-Fi as
  your dev machine).
- Press `a` in the terminal to launch an Android emulator, `i` for iOS
  simulator (Mac only).
- First launch in Expo Go may render LTR for a frame before RTL kicks in —
  this is expected (see docs/12-mobile-app.md); a dev build is RTL from frame 1.

Caveat: Expo Go can't run custom native config plugins properly (RTL forcing
is one example). For anything native-sensitive, use a dev build instead:

```bash
pnpm --filter @app/mobile android   # expo run:android — builds & installs a dev client
pnpm --filter @app/mobile ios       # expo run:ios (Mac only)
```

## 2. Typecheck / verify without a device or emulator

No emulator in this environment, so this is the closest thing to "does it
still build":

```bash
pnpm --filter @app/mobile typecheck
pnpm --filter @app/mobile bundle:check   # expo export --platform android; catches Metro resolution breakage
```

## 3. Build an APK locally (no EAS account needed)

This repo does **not** use `eas build`. Locally you generate the native
Android project yourself and build with Gradle directly:

```bash
cd apps/mobile
npx expo prebuild --platform android     # generates android/ (gitignored)
cd android
./gradlew assembleRelease                 # Windows: gradlew.bat assembleRelease
```

Output APK:
```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Requirements: JDK + Android SDK installed locally (same as any React Native
build). Signed with the default React Native **debug keystore** since no
production signing key is configured in this repo — fine for internal
testing/sideloading, **not** valid for Google Play.

**Raise the Gradle heap first.** `prebuild` writes
`org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m`, which is too small
now that expo-notifications and the Firebase Gradle plugin are in the build —
it dies with `OutOfMemoryError: Metaspace` during
`:expo-updates:kspReleaseKotlin`. In `apps/mobile/android/gradle.properties`:

```
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m
```

`android/` is gitignored and regenerated, so this must be re-applied after any
clean `prebuild` (the GitHub Actions workflow does it with a `sed` step).

`EXPO_PUBLIC_API_URL` from `apps/mobile/.env` is baked into the JS bundle at
this build step — make sure it points somewhere the APK's users can actually
reach (not your dev laptop's LAN IP, if handing the APK to someone else).

## 4. Build an APK via GitHub Actions (no local Android SDK needed)

`.github/workflows/mobile-build.yml` does the same `prebuild` +
`assembleRelease` steps above, but on a GitHub-hosted runner:

- Triggers automatically on push to `main` touching `apps/mobile` or
  `packages/{api-client,types,ordering}`, or manually via the **Actions** tab.
- Reads `EXPO_PUBLIC_API_URL` from the repo's Actions **Variables**
  (Settings → Secrets and variables → Actions → Variables) — set this once so
  builds don't ship without a valid API URL.
- On success: uploads the APK as a workflow-run Artifact, and creates a
  GitHub Release tagged `mobile-v<version>-<run-number>` with the APK
  attached (a stable, shareable download link).

## 5. Ship a JS-only update without rebuilding the APK (OTA)

For pure JS/TS changes (no native code change, no version bump), skip
rebuilding an APK entirely — push to already-installed apps instead:

```bash
pnpm --filter @app/mobile publish-update
```

This runs `expo export --platform all` and copies the bundle into
`apps/api`'s self-hosted update server (`EXPO_UPDATES_STORAGE_DIR`, see
`apps/api/src/updates/`). Installed apps pick it up automatically on next
cold start or return-from-background — no store review, no EAS account.

Note: `app.json`'s `updates.url` is **not set yet** — it must point at your
API's `/updates/manifest` before this does anything:

```json
"updates": {
  "enabled": true,
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 0,
  "url": "http://<your-api-host>/updates/manifest"
}
```

A native code change or a bump of `expo.version` in `app.json` requires a new
APK (section 3/4) — OTA only carries matching `runtimeVersion` (= JS-only
changes).

## 6. Push notifications (Firebase / FCM)

Push goes straight to FCM — no Expo account, no EAS project. One-time setup:

1. Create a Firebase project, then add an **Android** app with package
   `com.tasksfollow.app` (must match `app.json` exactly).
2. Download `google-services.json` into `apps/mobile/` (gitignored). Required at
   `prebuild` time — without it the APK build fails once the plugin is active.
3. Firebase Console → Project settings → Service accounts → **Generate new
   private key**. Point the API at it in `apps/api/.env`:

```
FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-service-account.json"
```

Leave that unset and push is simply off: the API logs one warning at startup and
the in-app bell keeps working. Dev machines and CI need no Firebase at all.

4. For the GitHub Actions build, add the file's **contents** as a repo secret
   named `GOOGLE_SERVICES_JSON` (Settings → Secrets and variables → Actions).

Testing:

- **Expo Go cannot receive push** (removed in SDK 53) and neither can an
  emulator — you need a dev build on a real device:
  `pnpm --filter @app/mobile android`.
- Delivery is on a ~30s sweep, not instant. Assign a card to another account,
  background the app, and wait a moment.
- To check the backend half without a device, confirm `pushedAt` gets stamped:

```bash
curl -X POST localhost:3000/notifications/devices \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"token":"fake-token","platform":"ANDROID"}'
```

## Gotchas

- **`Cannot find module '@app/api-client'` or `@app/types`**: you skipped
  step 0 — rebuild those packages before running the mobile app.
- **App can't reach the API from a real phone**: `EXPO_PUBLIC_API_URL` is
  still `localhost`. Use your LAN IP, and confirm phone + dev machine are on
  the same network (no VPN splitting them).
- **RTL looks wrong on first Expo Go launch**: expected, see §1. Use a dev
  build (`expo run:android`) if you need to verify RTL exactly.
- **APK exists but crashes/can't reach API**: the URL was baked in at build
  time from whatever `.env` said then — rebuild if you change it.
- **`prebuild` fails on a missing `google-services.json`**: see §6 — the file is
  gitignored, so every machine and the CI runner needs its own copy.
- **`prebuild` fails with `EBUSY: resource busy or locked, rmdir android`**: a
  process has `android/` open — commonly a terminal whose working directory is
  inside it, the Expo dev server, or a Gradle daemon. Either `cd` that terminal
  out and stop those, or use `npx expo prebuild --platform android --no-clean`,
  which applies config changes in place instead of recreating the folder.
- **`OutOfMemoryError: Metaspace` / "Could not receive a message from the
  daemon"**: the Gradle heap is still at prebuild's default — see §3.
- **No push arriving**: check in order — running a dev build (not Expo Go) on a
  real device; the notification permission was granted; the API logged
  "Push notifications enabled" at startup (not the warning); and up to 30s has
  actually passed.
