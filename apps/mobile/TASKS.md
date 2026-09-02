# Mobile App — Tasks Plan

Source of truth for scope/status: `docs/12-mobile-app.md` (implementation
status) and the root `README.md` Roadmap (phase 2, "in progress"). Update
this file, and the two docs above, in the same change whenever a task's
status moves.

## Done (Phase 0)

- [x] App shell — expo-router file-based routes, RTL + Cairo font setup
- [x] Bottom tab bar (اللوحات · مهامي · التقارير · حسابي)
- [x] Login screen with all its states (invalid credentials, inactive
      account, loading)
- [x] Boards list — read-only, with loading skeletons / empty state /
      error-with-retry
- [x] "حسابي" (My Account) screen — user card + logout
- [x] Shared `packages/api-client` extracted so web and mobile use one
      token-refresh/auth implementation
- [x] `EXPO_PUBLIC_API_URL` config wired for LAN / emulator access

## Not built yet

- [x] **مهامي (My Tasks) tab** — real screen backed by the new
      `GET /my-tasks` endpoint (`apps/api/src/my-tasks/`, not an admin
      report — see `docs/10-subtasks-and-assignment.md`): overdue-first
      section, then grouped by board; subtask rows show their parent
      card's title
- [ ] **التقارير (Reports) tab** — placeholder; visible to `ADMIN` role
      only via `href: null` (link stays valid, entry hidden from others)
- [x] Board card progress bar + "n task · m completed" counter — `GET /boards`
      now returns `memberCount`/`cardCount`/`doneCount`/`memberPreviews`
      (`BoardsService.boardAggregates`), rendered by `features/boards/board-card.tsx`
- [x] Board detail screen (`/board/:id`) — horizontal-scroll Kanban view
      with status chips, card face (title, lock icon, due-date chip,
      assignee avatars), and moving a card via its "→" arrow (to the next
      status) or a long-press sheet (to any status, or delete)
- [x] Card detail screen (`/card/:id`, modal presentation) — description,
      due date (quick-pick sheet), assignees, subtasks (create/toggle/
      delete/assign), restricted-access toggle, and history timeline. See
      `apps/api`'s Phase 1 schema additions (`Board.dueDate`, `CLOSED`
      status, `Card.priority`/`cost`/`recurrence`, `VIEWER` role) — those
      fields exist and round-trip but aren't surfaced in mobile UI yet.
- [x] Card *creation* (`/board/:id/cards/new`, modal) — title required,
      everything else optional (description, due date, assignees,
      subtasks, restricted access); sequential creation
      (`POST cards` → `updateAssignees` → `updateAccess` → `POST subtasks`
      per subtask) with resumable retry on partial failure (a `cardIdRef`/
      `doneSubtasksRef` pair skips already-completed steps instead of
      duplicating them). Opened from a column's "+ إضافة مهمة" row or the
      pinned bottom button (which targets whichever column is currently
      active in the horizontal scroll)
- [ ] List management on mobile (create/rename/reorder lists)
- [ ] Realtime updates — depends on the Socket.IO gateway, which is
      roadmap phase 1 and hasn't been started anywhere in the repo yet
- [ ] Push notifications (not yet scoped)

## UI / Design

Design source: `docs/app_design/Tasks Mobile Redesign.dc.html` (~40 screens,
390px width, RTL, Cairo) and its spec `docs/app_design/v2-new-style.md`, plus
the group-3 addendum `docs/app_design/uploads/design-prompt-group-3.md` —
all checked into this repo. Referenced by `docs/12-mobile-app.md` and by
comment in `src/theme/tokens.ts`.

What's implemented and matches the design system as documented:

- [x] Full token set wired in `src/theme/tokens.ts` — colors (incl. the
      `عاجل`/urgent color, deliberately distinct from alert and in-progress),
      status-category colors, radii, spacing, min touch target (44px), Cairo
      font weights/sizes. No component uses a raw hex literal.
- [x] RTL handling (`expo-localization` + `I18nManager.forceRTL`) and the
      Cairo-only text component (`components/text.tsx`)
- [x] Reusable primitives: `Screen`, `Button`, `Skeleton`, state views
      (empty/error), and a `ComingSoon` placeholder pattern used by the two
      unbuilt tabs so a half-built tab reads as "not built" rather than "bug"

What's visually built (screens with real UI, not placeholders):

- [x] Login (default, invalid-credentials, inactive-account, loading states)
- [x] Boards list (loading skeleton, empty state, error-with-retry, populated
      card grid via `features/boards/board-card.tsx`)
- [x] My Account (user card + logout)
- [x] Board detail (`app/board/[id].tsx`) — loading skeleton, error-with-retry,
      empty-lists state; `features/boards/list-column.tsx` and `card-item.tsx`
      render the columns/cards, `move-card-sheet.tsx` is the long-press sheet.
      No subtasks chip on the card face yet — needs `subtaskDone`/`subtaskTotal`
      per card on `GET /boards/:id` (a separate, still-open API gap from the
      board card's own progress bar, which is fixed — see below).
- [x] Card detail (`app/card/[id].tsx`) — modal presentation over the board
      screen; `features/cards/` holds `subtasks-section.tsx`,
      `history-section.tsx`, `assignee-picker-sheet.tsx` (reused for card
      assignees, subtask assignees, and restricted-access members), and
      `due-date-sheet.tsx` (quick-pick only — no calendar/Hijri yet, see
      below). Loading skeleton and error-with-retry states included.
- [x] Add-task screen (`app/board/[id]/cards/new.tsx`) — reuses the same
      `AssigneePickerSheet`/`DueDateSheet` as card detail
- [x] My Tasks (`app/(tabs)/my-tasks.tsx`) — overdue-first section (red),
      then per-board groups; `features/my-tasks/task-row.tsx` renders both
      card and subtask rows (the latter with a "ضمن: {parent}" note)

What the design almost certainly specifies but has zero implementation yet
(inferred from `docs/12-mobile-app.md`'s "لماذا تطبيق أصيل" rationale — bottom
sheets, long-press, image picker, file sharing — since these are the reasons
given for building native instead of a responsive web view):

- [x] Card detail / bottom sheet — `app/card/[id].tsx` (see above)
- [x] Long-press context menu — done for cards (`MoveCardSheet`); still
      missing anywhere else the design uses one
- [x] Image picker (attachments) — `expo-image-picker`, camera or library
      choice, in card detail's `AttachmentsSection`
- [ ] File sharing flows (still needed for the group-3c PDF export feature)
- [x] Any create/edit forms — card create/edit both exist now
      (`app/board/[id]/cards/new.tsx`, `app/card/[id].tsx`); board creation
      exists too (`features/boards/new-board-sheet.tsx`); list creation on
      mobile still doesn't exist (see "List management on mobile" above)
- [x] Board card's progress bar / task-count UI — done (see above)
- [x] My Tasks screen's actual layout — done (see above)
- [ ] Reports screen's actual layout (currently `ComingSoon`)

## Group 3a (notifications, comments, attachments, recurrence, password reset)

Full detail in `docs/14-notifications-comments-attachments.md`. Summary:

- [x] In-app notification bell + badge (`features/notifications/notification-bell.tsx`,
      polled every 30s) in the "اللوحات"/"مهامي" headers
- [x] Notification center (`app/notifications.tsx`) — today/yesterday/older
      groups, tap opens the card and marks read, "تحديد الكل كمقروء"
- [x] Notification prefs section in "حسابي" (`features/account/notification-prefs-section.tsx`)
- [x] Recurrence — `RecurrenceSheet` (shared by add-task and card detail),
      ↻ icon on the card face; server spawns the next instance into «جديد»
      when the current one moves to «انتهى» (`CardsService.spawnNextRecurrence`)
- [x] Attachments — `AttachmentsSection` in card detail (grid, camera/library
      picker, full-screen viewer, delete with confirm)
- [x] Comments — merged into card detail's "السجل والتعليقات" section
      (`history-section.tsx`), composer + long-press-to-delete on own comments
- [x] `ConfirmSheet` shared component (`components/confirm-sheet.tsx`) —
      replaces every ad-hoc two-tap confirm (card delete, remove member,
      archive board, admin password reset)
- [x] Admin-issued password reset with one-time temporary password
      (`features/admin/reset-password-result-sheet.tsx`) + the forced
      "عيّن كلمة مرور جديدة" screen (`app/change-password-required.tsx`)

## Group 3b (priority, search/filter, board archive, restricted "move to done", owner summary, disabled user)

Full detail in `docs/05-boards-lists-cards.md`, `docs/04-authorization.md`,
`docs/11-reports.md`, and `docs/12-mobile-app.md`. Summary:

- [x] Priority — `components/priority-control.tsx` (segmented control in
      add-task, tap-to-cycle chip in card detail, saved immediately), right-edge
      stripe on the card face (`card-item.tsx`) and on `TaskRow` (urgent only),
      urgent-first display sort in `list-column.tsx`/`my-tasks.tsx`
- [x] In-board search + filter — `⌕` in the board header switches to a
      status-grouped vertical list (`board/[id].tsx`), title highlighting
      (`card-item.tsx`'s `HighlightedTitle`), filter sheet
      (`features/boards/board-filter-sheet.tsx`: my-tasks-only, by member, by
      priority) — entirely client-side over the already-fetched board detail,
      no new endpoint
- [x] Board archive — `/archived-boards` list screen, archived banner +
      restore button on the board screen, restore button in board settings,
      read-only gating (`ListColumn`'s `readOnly`: no add/move/long-press)
- [x] Restricted "move to انتهى" — arrow button and the `MoveCardSheet` row
      hidden/disabled for non-owner non-assignees, with the real enforcement
      server-side (`CardsService.update`)
- [x] Owner board summary — board header's ⋯ opens a small menu (owner only:
      "ملخّص اللوحة" / "إعدادات اللوحة"), summary sheet
      (`features/boards/board-summary-sheet.tsx`)
- [x] Disabled user — faded avatar + "معطَّل" badge on card-detail assignee
      chips and board-settings member rows; workload report (web) shows the
      same badge

## Verification notes

- `pnpm --filter @app/mobile bundle:check` proves the app still bundles
  (`expo export --platform android`) — the only automated check available
  with no device/emulator in CI.
- RTL layout, Cairo font rendering, and any gesture/sheet interactions can
  only be verified by actually running the app (`pnpm --filter @app/mobile
  dev`) on a device or emulator — confirmed working locally as of
  2026-08-29 (Android emulator, Expo Go 57.0.9).
- Board detail screen, confirmed on an Android emulator (2026-08-31): the
  column FlatList, move-via-arrow, long-press `MoveCardSheet`, lock icon,
  overdue/upcoming due-date chip styling, assignee avatars, and per-column
  empty states all work as designed. One real bug was found and fixed in
  the process — under forced RTL, React Native's horizontal `FlatList`
  mirrors `scrollToIndex`'s target and `onViewableItemsChanged`'s reported
  index end-to-start relative to what's actually rendered (confirmed by
  hand: tapping status chip 1 of 5 landed on chip 3, i.e. `length-1-index`).
  Both the tap-to-jump status chips and the active-chip highlight now
  correct for this (see the comment above `scrollToColumn` in
  `app/board/[id].tsx`). Anyone adding another horizontal `FlatList` to this
  app should expect the same mirroring and compensate the same way.
- Card detail screen, confirmed on an Android emulator (2026-08-31): opening
  a card from the board, editing description, picking a due date via the
  quick-pick sheet (chip updates immediately, no save needed), the assignee
  picker (title/subtitle, save/cancel), toggling restricted access (instant
  save on uncheck, "اختيار الأعضاء" appears on check), subtasks (progress
  bar, checkbox toggle with strikethrough, per-subtask assign, delete), the
  history timeline, and the header's «حفظ» — confirmed it persists and the
  board screen reflects the change after `invalidateQueries` (no stale
  cache). One real bug found and fixed: the screen's header rendered
  underneath the status bar because it used a plain `View` instead of the
  `Screen` component (no safe-area top inset) — this route has no native
  nav header of its own (`headerShown: false` globally), so it must apply
  the inset itself.
- Also fixed: `packages/api-client`'s `cards` object had no `get(id)`
  method even though `GET /cards/:id` existed server-side — added it
  (needed to fetch a single card for the detail screen).
- My Tasks + add-task, confirmed on an Android emulator (2026-08-31):
  `/my-tasks` correctly aggregates cards and subtasks assigned to the
  current user across two different boards, puts overdue items in their
  own red section regardless of board, groups the rest by board, and
  excludes a card seeded in a `DONE` list (confirmed via a script-created
  test board before touching the UI). Add-task: opened from both the
  per-column "+" row and the pinned bottom button (which correctly tracked
  the active column through the horizontal scroll), filled in a title,
  submitted, and confirmed the new card appears in the right column with
  the right count on return to the board screen (`invalidateQueries`
  again, no stale cache).
- Group 3a, confirmed on an Android emulator (2026-09-02): notification bell
  badge + center (mark-one-read, mark-all-read) both correct; notification
  prefs switches persist and actually gate notification creation server-side
  (toggling a pref off then re-triggering the event produces no notification);
  a weekly-recurring card moved to «انتهى» correctly spawned its next instance
  in «جديد» with the right due date and the same assignee; card detail's
  "السجل والتعليقات" section and the attachments grid both render correctly.
  The full admin password-reset chain was verified end-to-end: generating a
  temp password → copying it → logging in as the target user with it → the
  forced "عيّن كلمة مرور جديدة" screen appearing automatically (no re-entry of
  the temp password needed) → saving → landing on the boards list normally.
- Group 3b (2026-09-02): no Android emulator/device was available in this
  session's environment, so this round is verified by `typecheck` and
  `bundle:check` only (both clean across `@app/types`, `@app/api`, `@app/web`,
  and `@app/mobile`) plus the API's own type-level guarantees (Zod request/
  response schemas). RTL layout, the tap-to-cycle priority chip, the
  search/filter grouped view, and the archived-board banner still need an
  actual on-device pass before being called done the way earlier phases were.
