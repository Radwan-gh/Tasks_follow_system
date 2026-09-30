# Building the Android APK

How to produce a release APK of `apps/mobile` on your own machine with Gradle —
no Expo/EAS account needed. Commands are for **Windows PowerShell** and start
from the repo root.

For the CI build, OTA updates and push setup, see [CHEATSHEET.md](CHEATSHEET.md).

## One-time machine setup

1. **JDK 17** (e.g. Eclipse Temurin 17). `java -version` should print `17`.

2. **Android SDK.** Install Android Studio, then in *SDK Manager* install:
   - Android SDK Platform **36**
   - Android SDK Build-Tools **36.0.0**
   - NDK **27.1.12297006**
   - CMake **3.22.1**

   These are the versions Expo picks for this project; Gradle prints them at the
   start of every build under `[ExpoRootProject]`.

3. **`ANDROID_HOME`** — tells Gradle where the SDK is:

   ```powershell
   [Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
   ```

   Then **open a new terminal** (and restart VS Code) — windows that were already
   open do not see the new variable. Without it the build fails with
   `SDK location not found`. Don't use `android/local.properties` instead:
   `prebuild` regenerates the `android/` folder and the file is lost.

4. **`google-services.json`** in `apps/mobile/` — the Firebase config for push
   notifications. It is gitignored, so each machine needs its own copy: Firebase
   Console → project `taskfollowsystem` → Android app `com.tasksfollow.app` →
   download `google-services.json`. `prebuild` fails without it.

## Build steps

### 1. Install dependencies and build the shared packages

```powershell
pnpm install
pnpm --filter @app/types build
pnpm --filter @app/api-client build
```

The app bundles the compiled `dist/` of these two packages. Skipping this gives
`Cannot find module '@app/api-client'`.

### 2. Generate the native Android project

```powershell
cd apps/mobile
npx expo prebuild --platform android
```

This creates `apps/mobile/android/` from `app.json`. The folder is gitignored and
disposable — rerun this step whenever `app.json`, a config plugin, or a native
dependency changes.

### 3. Raise the Gradle memory limit

Open `apps/mobile/android/gradle.properties` and change the `org.gradle.jvmargs`
line to:

```
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m
```

`prebuild` writes `-Xmx2048m -XX:MaxMetaspaceSize=512m`, which can crash the
build with `OutOfMemoryError: Metaspace`. Re-apply this after every `prebuild`.

### 4. Build

```powershell
cd android
.\gradlew.bat assembleRelease
```

The first build takes about 8 minutes (it compiles native C++); later builds are
faster. Use `.\gradlew.bat` — `./gradlew` is the Linux/macOS script.

### 5. Copy the APK to `apps/mobile/apk/`

Gradle writes the APK deep inside
`apps/mobile/android/app/build/outputs/apk/release/` as `app-release.apk`.
Copy it to `apps/mobile/apk/` under a name that carries the app version (from
`app.json`) and the date it was built (run this from `android/`, where step 4
left you):

```powershell
$version = (Get-Content ..\app.json -Raw -Encoding UTF8 | ConvertFrom-Json).expo.version
$apk     = Get-Item app\build\outputs\apk\release\app-release.apk
$name    = "tasks-follow-system-v$version-$($apk.LastWriteTime.ToString('yyyy-MM-dd')).apk"
New-Item -ItemType Directory -Force ..\apk | Out-Null
Copy-Item $apk.FullName "..\apk\$name"
"Saved apps/mobile/apk/$name"
```

This gives e.g. `apps/mobile/apk/tasks-follow-system-v1.1.0-2026-09-30.apk`.
Older APKs stay in the folder; a second build of the same version on the same
day replaces that day's file. The folder is outside `android/`, so `prebuild`
never deletes it, and git ignores `*.apk`, so nothing in it is committed. Only
copy after `BUILD SUCCESSFUL` — if the build failed, the file Gradle left behind
is from the previous build.

Copy it to the phone and open it, or install it over USB (USB debugging on) —
in the same PowerShell window, since it reuses `$name`:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "..\apk\$name"
```

## Build a smaller APK

The regular APK is about **99 MB** because it carries the native code for four
CPU types (`armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`), while a phone only ever
uses one. Do build steps 1–3 as usual, replace step 4 with one of these, then
copy the APK to `apps/mobile/apk/` with step 5 as usual.

### Option A — phone CPU only (about 46 MB, recommended)

```powershell
cd android
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a"
```

`arm64-v8a` runs on virtually every current Android phone, and the build is
faster because only one CPU type is compiled. A few old or very cheap phones run
32-bit Android and will say *App not installed* — for those, add the 32-bit
code too (about 59 MB):

```powershell
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"
```

### Option B — also shrink the code (about 34 MB)

```powershell
cd android
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a" "-Pandroid.enableMinifyInReleaseBuilds=true" "-Pandroid.enableShrinkResourcesInReleaseBuilds=true"
```

This turns on R8, which removes unused Java/Kotlin code and resources. The
build succeeding does not prove the app works: R8 can remove code that a library
only loads at runtime, and the app then crashes when it reaches that code.
**Before sharing an Option B APK, install it on a phone and go through sign-in,
a board, a card and notifications.** If anything crashes, use Option A.

Notes:

- **Keep the quotes** around every `-P...` argument. PowerShell splits an
  unquoted argument that contains a dot (`-Pandroid.enable...`), and Gradle
  receives a broken value.
- The `-P` flags apply to that one build only — nothing is written to a file, so
  they are not lost when `prebuild` regenerates `android/`. Run the command
  without them to get the regular APK again.

## Good to know

- **The API URL is baked in at build time** from `.env.production` (the deployed
  Railway API). The build log confirms it with `env: load .env.production`.
  Changing the URL means building a new APK.
- **The APK is signed with the debug key.** Fine for installing directly on
  phones; Google Play will not accept it.
- **JS-only change?** You may not need a new APK at all — publish an OTA update
  instead (CHEATSHEET.md §5).

## Troubleshooting

| Error | Fix |
|---|---|
| `SDK location not found` | `ANDROID_HOME` is not set, or the terminal was opened before you set it — setup step 3. |
| `OutOfMemoryError: Metaspace` / `Could not receive a message from the daemon` | Build step 3. |
| `EBUSY: resource busy or locked, rmdir android` during `prebuild` | Something holds `android/` open: a terminal inside it, the Expo dev server, or a Gradle daemon. `cd` out of it, run `.\gradlew.bat --stop` from `android/`, and retry — or use `npx expo prebuild --platform android --no-clean`. |
| `prebuild` complains about `google-services.json` | Setup step 4. |
| `Cannot find module '@app/api-client'` or `'@app/types'` | Build step 1. |
| *App not installed* / `INSTALL_FAILED_NO_MATCHING_ABIS` with a smaller APK | The phone runs 32-bit Android — build with `"-PreactNativeArchitectures=armeabi-v7a,arm64-v8a"` (Option A). |
| Option B APK crashes on open or on one screen | R8 removed code the app needs at runtime — use Option A. |
