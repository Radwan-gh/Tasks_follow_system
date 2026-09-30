# Builds a release APK of apps/mobile locally with Gradle and copies it to
# apps/mobile/apk/. Automates apps/mobile/BUILD_APK.md end to end.
#
#   powershell -ExecutionPolicy Bypass -File .claude\skills\build-apk\scripts\build-apk.ps1 [-Variant arm64|universal|arm32-64|arm64-min] [-Install]
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts in
# the ANSI codepage.

param(
    [ValidateSet('universal', 'arm64', 'arm32-64', 'arm64-min')]
    [string]$Variant = 'arm64',
    [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`nFAILED: $msg" -ForegroundColor Red; exit 1 }

# Runs a native command with stderr merged into stdout as plain strings.
# Windows PowerShell 5.1 turns native stderr lines into ErrorRecords, which
# would abort the script under $ErrorActionPreference = 'Stop'.
function Invoke-Native([scriptblock]$Command) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $saved }
}

$repo    = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$mobile  = Join-Path $repo 'apps\mobile'
$android = Join-Path $mobile 'android'
$apkDir  = Join-Path $mobile 'apk'
$log     = Join-Path $env:TEMP 'build-apk-gradle.log'

# --- Preflight (BUILD_APK.md "One-time machine setup") ----------------------
Step 'Checking machine setup'
$javaVersion = (cmd /c 'java -version 2>&1' | Select-Object -First 1)
if ($javaVersion -notmatch '"17\.') { Fail "JDK 17 required, found: $javaVersion" }
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User') }
if (-not $sdk -or -not (Test-Path $sdk)) { Fail 'ANDROID_HOME is not set or does not exist (BUILD_APK.md setup step 3).' }
$env:ANDROID_HOME = $sdk
if (-not (Test-Path (Join-Path $mobile 'google-services.json'))) {
    Fail 'apps/mobile/google-services.json is missing (BUILD_APK.md setup step 4).'
}
Write-Host "java: $javaVersion"
Write-Host "ANDROID_HOME: $sdk"

# --- Step 1: deps + shared packages -----------------------------------------
Step 'Installing dependencies and building shared packages'
Push-Location $repo
try {
    cmd /c 'pnpm install 2>&1'
    if ($LASTEXITCODE -ne 0) { Fail 'pnpm install' }
    foreach ($pkg in '@app/ordering', '@app/types', '@app/api-client') {
        cmd /c "pnpm --filter $pkg build 2>&1"
        if ($LASTEXITCODE -ne 0) { Fail "pnpm --filter $pkg build" }
    }
} finally { Pop-Location }

# --- Step 2: prebuild -------------------------------------------------------
Step 'Generating the native Android project (expo prebuild)'
$gradlew = Join-Path $android 'gradlew.bat'
if (Test-Path $gradlew) {
    Push-Location $android
    Invoke-Native { & $gradlew --stop } | Out-Null
    Pop-Location
}
Push-Location $mobile
try {
    cmd /c 'npx expo prebuild --platform android 2>&1'
    if ($LASTEXITCODE -ne 0) {
        # Usually EBUSY: something still holds android/ open. Reuse it instead.
        Write-Host 'Clean prebuild failed; retrying with --no-clean' -ForegroundColor Yellow
        cmd /c 'npx expo prebuild --platform android --no-clean 2>&1'
        if ($LASTEXITCODE -ne 0) { Fail 'expo prebuild' }
    }
} finally { Pop-Location }

# --- Step 3: Gradle memory --------------------------------------------------
Step 'Raising the Gradle JVM memory limit'
$props = Join-Path $android 'gradle.properties'
(Get-Content $props) -replace '^org\.gradle\.jvmargs=.*', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=2048m' |
    Set-Content $props -Encoding ascii
Select-String -Path $props -Pattern '^org\.gradle\.jvmargs=' | ForEach-Object { Write-Host $_.Line }

# --- Step 4: Gradle build ---------------------------------------------------
# `:app:createBundleReleaseJsAndAssets --rerun` forces the JS bundle to be
# rebuilt: Gradle can otherwise mark it UP-TO-DATE and ship a bundle from an
# earlier build, and this run's log would not show which .env was baked in.
$gradleArgs = @(':app:createBundleReleaseJsAndAssets', '--rerun', 'assembleRelease')
switch ($Variant) {
    'arm64'     { $gradleArgs += '-PreactNativeArchitectures=arm64-v8a' }
    'arm32-64'  { $gradleArgs += '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a' }
    'arm64-min' { $gradleArgs += '-PreactNativeArchitectures=arm64-v8a',
                                 '-Pandroid.enableMinifyInReleaseBuilds=true',
                                 '-Pandroid.enableShrinkResourcesInReleaseBuilds=true' }
}
Step "Building the $Variant APK (gradlew.bat $($gradleArgs -join ' '))"
Write-Host "Full log: $log"
Push-Location $android
try {
    Invoke-Native { & $gradlew @gradleArgs } | Tee-Object -FilePath $log
    $gradleExit = $LASTEXITCODE
} finally { Pop-Location }
if ($gradleExit -ne 0) { Fail "Gradle exited with $gradleExit - see $log and the Troubleshooting table in apps/mobile/BUILD_APK.md" }
if (-not (Select-String -Path $log -Pattern 'env: load \.env\.production' -Quiet)) {
    Fail "The JS bundle did not load .env.production (see $log) - the APK may point at the wrong API. Not copying it."
}

# --- Step 5: copy to apps/mobile/apk ----------------------------------------
Step 'Copying the APK to apps/mobile/apk'
$version = (Get-Content (Join-Path $mobile 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json).expo.version
# app.json sets runtimeVersion as a policy, not a value; read the resolved value
# prebuild baked into the native project, which is what OTA updates match on.
$strings = Join-Path $android 'app\src\main\res\values\strings.xml'
$runtime = ([xml](Get-Content $strings -Raw -Encoding UTF8)).resources.string |
    Where-Object { $_.name -eq 'expo_runtime_version' } | ForEach-Object { $_.'#text' }
if (-not $runtime) { Fail "expo_runtime_version not found in $strings - is expo-updates configured?" }
$apk     = Get-Item (Join-Path $android 'app\build\outputs\apk\release\app-release.apk')
$suffix  = if ($Variant -eq 'universal') { '' } else { "_$Variant" }
$name    = "tasks_${version}_$runtime$suffix.apk"
New-Item -ItemType Directory -Force $apkDir | Out-Null
$dest = Join-Path $apkDir $name
Copy-Item $apk.FullName $dest -Force
$mb = [math]::Round((Get-Item $dest).Length / 1MB, 1)

# --- Optional install -------------------------------------------------------
if ($Install) {
    Step 'Installing on the connected device (adb install -r)'
    $adb = Join-Path $sdk 'platform-tools\adb.exe'
    cmd /c "`"$adb`" install -r `"$dest`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Fail 'adb install (is a device connected with USB debugging on?)' }
}

Write-Host "`nAPK_PATH=$dest" -ForegroundColor Green
Write-Host "APK_SIZE_MB=$mb"
Write-Host "APK_VERSION=$version"
Write-Host "APK_RUNTIME_VERSION=$runtime"
Write-Host "APK_VARIANT=$Variant"
Write-Host 'API_ENV=.env.production'
