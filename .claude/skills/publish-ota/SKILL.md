---
name: publish-ota
description: Publish a JS-only OTA (over-the-air) update of apps/mobile to the self-hosted xprem update server, so installed APKs pick it up without a rebuild. Use when the user asks to push, publish or ship an OTA update / new OTA version, or to update the installed app without building a new APK.
---

# Publish an OTA update

Runs `apps/mobile/CHEATSHEET.md` §5 through one script,
`scripts/publish-ota.ps1`. That section is the source of truth; if a step here
and the cheatsheet disagree, fix the script to match the cheatsheet.

Publishing is outward-facing: the update reaches every installed APK on the
same runtime version, on its next launch. Run it when the user asked for a
publish. If you are only inferring that one would help, ask first.

## 1. Check that an OTA update can carry the change

An update is only delivered to APKs whose `runtimeVersion` matches, and
`runtimeVersion` is `expo.version` in `apps/mobile/app.json` (`appVersion`
policy). So:

- **Don't bump `expo.version` to publish.** That creates a new runtime that no
  installed APK is on, and the update reaches nobody. A version bump needs a
  new APK (the `build-apk` skill).
- **Native changes need a new APK, not an OTA update.** Look at what changed
  since the installed APK was built (`git log`/`git diff` on `apps/mobile`):
  new or upgraded native dependencies in `package.json`, `plugins` or
  permissions in `app.json`, or `google-services.json`. If any changed, tell
  the user an APK is required. Publish only if they still want the JS part out
  now.

## 2. Run the script

It takes ~1-2 minutes. Run it with the PowerShell tool and a timeout of 600000:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<repo>\.claude\skills\publish-ota\scripts\publish-ota.ps1"
```

Options:

| Flag | Use when |
|---|---|
| `-Message "..."` | The user gave a description. Defaults to the last commit's subject. |
| `-Rollout N` | The user asks for a staged/partial rollout (1-99 % of devices). Progress it from the dashboard. |
| `-AllowDirty` | Only after the user agrees to ship uncommitted changes (see below). |
| `-DryRun` | Checks and exports the bundle but publishes nothing. For testing the script. |

Use the absolute repo path. **Never pass, print or echo the token.**

## 3. Handle the preflight failures

The script prints a `FAILED:` line:

- **`EOO_TOKEN is not set`.** The script looks for the token in the
  `EOO_TOKEN` environment variable (process, then user), then in
  `.claude/skills/publish-ota/.eoo-token`. That file is gitignored: never
  commit it, and never read it into the conversation. Ask the user to set the
  variable in their own terminal, so the secret stays out of this conversation:
  ```powershell
  [Environment]::SetEnvironmentVariable('EOO_TOKEN', '<tms-publish token>', 'User')
  ```
  They get it from `https://ota-production-6c85.up.railway.app/dashboard/` →
  API tokens (`tms-publish`). Then rerun. The script reads the user variable
  directly, so no restart is needed.
- **`Uncommitted changes ...`.** The update ships the working tree, so it would
  carry edits no commit records. Offer to commit them first (preferred), or
  rerun with `-AllowDirty` if the user says so.
- **`typecheck` / `pnpm ... build`.** Fix the error, or report it. Don't
  publish around it.
- **`PUBLISHED, but the exported bundle does not contain the .env.production API URL`.** The update is
  live but may point at the wrong API. Tell the user right away, and give them
  the rollback steps below.

## 4. Report the result

On success the last lines are:

```
OTA_RESULT=published
OTA_RUNTIME_VERSION=1.1.0
OTA_BRANCH=production
OTA_CHANNEL=production
OTA_COMMIT=548c864 chore(mobile): ...
OTA_UPDATE_ID=0199....
API_ENV=.env.production
```

(`OTA_ROLLOUT_PERCENT` appears only with `-Rollout`. `OTA_UPDATE_ID` appears
only if the metadata file carried an id. If it's missing, point the user at the
dashboard.)

Report the runtime version (only APKs on that version receive it), the
commit, the update id, and that it was built against the production API.

Then tell them how to verify it on a phone, because **every OTA failure is
silent** (a bad signature or wrong app id looks exactly like "no update"):

1. Fully close the app and reopen it (or bring it back from the background).
   It may take one more restart to apply.
2. Open **حسابي** and scroll to the footer.
3. `update <first 8 chars>` should match the update id, and the status line
   should read «آخر تحديث …».
4. «يعمل التطبيق بالنسخة المثبَّتة دون تحديثات» means it didn't land. The
   «نسخ التفاصيل» button copies the full id, runtime and any check error.

**Rollback:** in the OTA dashboard, remap the `production` channel to the
previous branch. That's two clicks, with no rebuild and no republish.

## What the script guarantees

- It reads `EOO_TOKEN` from the process or user environment, or from the
  gitignored `.eoo-token` file next to this skill, and never prints it.
- It refuses to publish uncommitted changes under `apps/mobile` or `packages/`
  unless `-AllowDirty` is passed.
- It fails if `runtimeVersion` stops being the `appVersion` policy, since the
  version reported would then be wrong.
- It builds the shared packages and typechecks `apps/mobile` before publishing.
- It publishes Android only, to branch `production`, non-interactively.
- It checks that the exported Hermes bundle contains the `EXPO_PUBLIC_API_URL`
  from `.env.production`. (Not the log: eoas exports with `EXPO_NO_DOTENV=1`,
  which also silences Expo's `env: load` line.)
- It runs eoas with `--packageRunner eoas-runner`, which rewrites the Windows
  backslash asset paths in `dist/metadata.json` to forward slashes (see
  `scripts/eoas-runner.js`). Needs xprem server 3.2.0+.
