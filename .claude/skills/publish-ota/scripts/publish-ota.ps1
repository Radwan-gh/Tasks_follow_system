# Publishes a JS-only OTA update of apps/mobile to the self-hosted xprem server.
# Automates apps/mobile/CHEATSHEET.md section 5 end to end.
#
#   powershell -ExecutionPolicy Bypass -File .claude\skills\publish-ota\scripts\publish-ota.ps1 [-Message "..."] [-Rollout 1-99] [-AllowDirty] [-DryRun]
#
# -DryRun runs every check and exports the bundle, but publishes nothing.
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts in
# the ANSI codepage.

param(
    [string]$Message,
    [ValidateRange(1, 99)]
    [int]$Rollout,
    [switch]$AllowDirty,
    [switch]$DryRun
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

$repo   = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$mobile = Join-Path $repo 'apps\mobile'
$outDir = Join-Path $mobile 'dist'
$log    = Join-Path $env:TEMP 'publish-ota.log'

# --- Preflight --------------------------------------------------------------
Step 'Checking the publish token and the working tree'
if (-not $DryRun) {
    # The token is a secret: read it from the environment, never print it.
    # Order: process env, user env, then the skill's gitignored .eoo-token file.
    if (-not $env:EOO_TOKEN) { $env:EOO_TOKEN = [Environment]::GetEnvironmentVariable('EOO_TOKEN', 'User') }
    $tokenFile = Join-Path $PSScriptRoot '..\.eoo-token'
    if (-not $env:EOO_TOKEN -and (Test-Path $tokenFile)) { $env:EOO_TOKEN = (Get-Content $tokenFile -Raw).Trim() }
    if (-not $env:EOO_TOKEN) {
        Fail 'EOO_TOKEN is not set. Save the tasks token from the OTA dashboard (/dashboard/ -> API tokens) as a user environment variable named EOO_TOKEN, or in .claude/skills/publish-ota/.eoo-token (gitignored).'
    }
    Write-Host 'EOO_TOKEN: set'
}

# An update should be a commit, so it can be traced and republished. What
# ships is the working tree, so uncommitted edits would ship unrecorded.
Push-Location $repo
try {
    $dirty = Invoke-Native { git status --porcelain -- apps/mobile packages }
    $commit = (Invoke-Native { git log -1 --format='%h %s' }) | Select-Object -First 1
} finally { Pop-Location }
if ($dirty) {
    Write-Host ($dirty -join "`n")
    if (-not $AllowDirty) { Fail 'Uncommitted changes in apps/mobile or packages/ would ship in this update. Commit them first, or rerun with -AllowDirty.' }
    Write-Host 'Publishing with uncommitted changes (-AllowDirty)' -ForegroundColor Yellow
}
Write-Host "commit: $commit"

# runtimeVersion uses the appVersion policy, so it equals expo.version. Only
# APKs built with this same version receive the update.
$appJson = Get-Content (Join-Path $mobile 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($appJson.expo.runtimeVersion.policy -ne 'appVersion') {
    Fail "app.json runtimeVersion is not the appVersion policy - update this script before publishing."
}
$version = $appJson.expo.version
$channel = $appJson.expo.updates.requestHeaders.'expo-channel-name'
Write-Host "runtime version: $version (from expo.version)"
Write-Host "channel: $channel"

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
    # A type error that reaches phones can't be fixed by reinstalling;
    # stop it here.
    Step 'Typechecking apps/mobile'
    cmd /c 'pnpm --filter @app/mobile typecheck 2>&1'
    if ($LASTEXITCODE -ne 0) { Fail 'pnpm --filter @app/mobile typecheck' }
} finally { Pop-Location }

# --- Step 2: publish (or export, for a dry run) -----------------------------
if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
if ($DryRun) {
    $cmd = @('expo', 'export', '--platform', 'android', '--output-dir', 'dist')
    Step "Dry run: exporting the bundle only (npx $($cmd -join ' '))"
} else {
    if (-not $Message) { $Message = ($commit -replace '^\S+\s+', '') }
    $cmd = @('eoas@3', 'publish', '--branch', 'production', '--platform', 'android',
             '--nonInteractive', '--emitMetadata', '-m', $Message)
    if ($Rollout) { $cmd += @('--rollout-percentage', "$Rollout") }
    Step "Publishing to branch production (npx $($cmd -join ' '))"
}
Write-Host "Full log: $log"
Push-Location $mobile
try {
    Invoke-Native { & npx --yes @cmd } | Tee-Object -FilePath $log
    $exit = $LASTEXITCODE
} finally { Pop-Location }
if ($exit -ne 0) { Fail "npx exited with $exit - see $log" }

# The bundle must be built against the production API. A publish can't be
# undone from here, so if this check fails after a real publish, roll back.
$envOk = Select-String -Path $log -Pattern 'env: load .*\.env\.production' -Quiet
if (-not $envOk) {
    if ($DryRun) { Fail "The export did not load .env.production (see $log)." }
    Fail "PUBLISHED, but the log does not show .env.production being loaded (see $log). The update may point at the wrong API: check it on a phone, and roll back in the OTA dashboard if it is wrong."
}

# --- Report -----------------------------------------------------------------
$updateId = ''
$meta = Join-Path $outDir 'xprem-update-metadata.json'
if (-not $DryRun -and (Test-Path $meta)) {
    Step 'Update metadata'
    $metaText = Get-Content $meta -Raw -Encoding UTF8
    Write-Host $metaText
    $m = [regex]::Match($metaText, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
    if ($m.Success) { $updateId = $m.Value }
}

Write-Host "`nOTA_RESULT=$(if ($DryRun) { 'dry-run' } else { 'published' })" -ForegroundColor Green
Write-Host "OTA_RUNTIME_VERSION=$version"
Write-Host "OTA_BRANCH=production"
Write-Host "OTA_CHANNEL=$channel"
Write-Host "OTA_COMMIT=$commit"
if ($Rollout) { Write-Host "OTA_ROLLOUT_PERCENT=$Rollout" }
if ($updateId) { Write-Host "OTA_UPDATE_ID=$updateId" }
Write-Host 'API_ENV=.env.production'
