# Remaining Tasks

Project-wide list of what's still open, so work can be picked up later.
Gathered on 2026-10-01 from the README Roadmap, `docs/`, and
`apps/mobile/TASKS.md`, and checked against the code where possible.

Tick items here as they land. When an item's status changes, also update
the doc that owns it, as `CLAUDE.md` requires. The owning doc is named on
each item. The detailed per-screen mobile checklist stays in
`apps/mobile/TASKS.md`.

---

## 1. Mobile release pipeline (blocking, do in this order)

Details and the manifest-check `curl`: `apps/mobile/TASKS.md` («OTA updates —
remaining work»), `apps/mobile/CHEATSHEET.md` §5–6, `docs/12-mobile-app.md`.

- [ ] **Fix the CI APK build.** `.github/workflows/mobile-build.yml` exits at
      "Write Firebase config" when the `GOOGLE_SERVICES_JSON` repo secret is
      unset. No run has succeeded yet and there are no GitHub Releases.
      `apps/mobile/google-services.json` *is* committed and not gitignored,
      but CHEATSHEET §6 and the docs say it is ignored. Pick one approach:
      add the secret, or fall back to the committed file. Then make the
      workflow, `.gitignore` and docs agree.
- [ ] **Install a 1.1.0 APK on every device, once.** Builds made before
      `da38903` are 1.0.0 with no `updates.url` or certificate, so they can
      never receive an OTA update.
- [ ] **First real OTA publish, verified on a device.** Publish from a clean
      tree, deploying any API change it depends on to Railway first. Then
      confirm on the device that the «حسابي» version footer shows the new
      update id.
- [ ] **Rehearse a rollback once.** Every publish goes to the single
      `production` branch, so "remap to the previous branch" in the docs
      doesn't work. Find the real rollback path in the xprem dashboard, then
      fix CHEATSHEET §5 and `docs/12-mobile-app.md`.
- [ ] *(nice to have)* Manual OTA publish workflow in GitHub Actions: only
      `workflow_dispatch`, with `EOO_TOKEN` as a secret. It must never run on
      push.

## 2. Mobile feature gaps

- [ ] **List management on mobile**: create, rename and reorder lists. Only
      the web can do this today. Owning docs: `docs/12-mobile-app.md` and
      `apps/mobile/TASKS.md`.
- [ ] **Optional due time (§3c-5) on mobile**: `Card.dueDateHasTime` works
      end to end, and the web already has a time input (`CardDetailPanel.tsx`).
      Mobile's `DueDateSheet` has no time picker. It needs a lightweight
      design that adds no new native picker dependency.
- [ ] **Subtask counter on the card face (`☑ n/m`)**: needs
      `subtaskDone`/`subtaskTotal` per card on `GET /boards/:id` (API +
      `packages/types`), then the chip in `card-item.tsx`.
- [ ] **Full calendar in `DueDateSheet`**: today it only offers quick picks.
- [ ] **Long-press menus beyond cards**: only cards have one
      (`MoveCardSheet`). Check the design for other places that use one.

## 3. On-device verification still owed

Group 3c had no emulator or device available, so it was only
typechecked/bundle-checked. The API side was tested for real.

- [ ] Group 3c on a device: cost sheet, Hijri line, task templates
      (pick/save/rename/delete), viewer-role read-only gating, currency
      setting, Reports tab + PDF export/share.
- [ ] Attachments on a device: camera/library pick, upload of non-image
      files, full-screen viewer, delete.
- [ ] «عرض الأقدم» (`closedSince`) row under the «انتهى» column, using old
      enough test data.
- [ ] Disabled-user display and the assignee-picker restrictions from
      group 3b's last round.

## 4. Roadmap (not started)

- [ ] **Realtime collaboration**: a Socket.IO gateway that broadcasts
      per-board events (`card.moved`, `card.created`, …). Nothing exists in
      `apps/api` yet. Then add a foreground-only connection on mobile and
      live updates on web. Owning docs: README Roadmap §1 and
      `docs/01-overview.md`.
- [ ] **Automated backend e2e tests** (NestJS + supertest): auth, CRUD,
      concurrent moves, and permissions (OWNER/MEMBER/VIEWER, restricted
      cards, restricted "move to انتهى"). Today `apps/api` has only
      `board-templates.test.ts`, and only `packages/ordering` has a real test
      suite. Owning doc: README Roadmap §3.
- [ ] **Labels** on cards (new schema + API + both UIs).
- [ ] **Cross-board activity/notification feed**: today's history is per
      card.
- [ ] **PDF exporter bidi/shaping**: user-entered text that mixes Arabic and
      digits in one field can still render digits out of order. It needs a
      real shaping library, or a font with full presentation forms. See the
      known limitation in `docs/11-reports.md`.
- [ ] *(explicitly deferred)* User-customisable board templates
      (`docs/09-list-status-templates.md`), a multi-tenant "Organization"
      layer (`docs/01-overview.md`), and iOS push (`platform` is already
      stored).

## 5. Housekeeping

- [ ] **Stale docs.**
      - README Roadmap §4 says the due-time picker has "no UI yet", but the
        web now has one.
      - `docs/01-overview.md` still lists the mobile app, comments and
        attachments as deferred, but they are all built.
      - `apps/mobile/TASKS.md` leaves "File sharing flows" unticked, but PDF
        export already shares through `expo-sharing`. Verify it, then tick it.
- [ ] **Clean up merged branches and worktrees.** Candidates:
      `ci/small-apk`, `claude/user-info-editing-ig87cb`,
      `fix/railway-web-build-api-client`, `ota/migrate-to-xprem`,
      `worktree-login-v2-username`, `worktree-mobile-account-version-line`
      and their `.claude/worktrees/*` folders. Confirm each is merged before
      deleting it.
