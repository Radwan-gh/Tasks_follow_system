# Mobile App — Business Features Brief for the Designer

This document lists **everything the mobile app does today** (business features, rules,
screens and states) so a designer can produce a new design that covers the full
product without missing behaviour. Arabic UI labels are the strings the app actually
shows; keep them (or propose better wording) — the product is Arabic-only and RTL.

Source of truth for the rules is `docs/` (Arabic). This brief is derived from it and
from the current `apps/mobile` implementation.

---

## 1. What the product is

A **team task-tracking app in Kanban style** (similar to Trello), used by an
organisation whose accounts are created by an administrator. Work is organised as:

```
Board (لوحة)  →  Lists / Statuses (قوائم / حالات)  →  Cards / Tasks (بطاقات / مهام)  →  Subtasks (مهام فرعية)
```

- A **card's status is the list it lives in**. Moving a card between lists = changing its status.
- Every board seeded from the standard template has these five statuses, in order:
  **جديد → جاهز للتنفيذ → قيد التنفيذ → تم التنفيذ → انتهى**
  (`NEW → READY → IN_PROGRESS → DONE → CLOSED`). Boards can also be created empty and have custom lists.
- Language: **Arabic only**. Layout: **RTL is the layout, not a setting**. Font: **Cairo**.
- Platform today: Android (APK), phone-sized (design reference width 390px). iOS is not shipped yet.
- **No self-registration.** The login screen must tell the user to ask the administrator for an account.
- **No drag-and-drop on mobile** (intentional). Cards are moved with a "next status" arrow and a "move to…" bottom sheet.

---

## 2. Users, roles and what they can see

There are **two independent role layers**. The design must show/hide actions accordingly.

### 2.1 System role (whole app)

| Role | What it unlocks in the UI |
|---|---|
| `USER` (default) | Everything in sections 4–9 except admin-only items |
| `ADMIN` | + «التقارير» tab · «المستخدمون والصلاحيات» screen · «رمز العملة» setting · can always send push notifications |

Extra per-user flag: **`canSendNotifications`** — lets a normal `USER` open the «إرسال إشعار» screen. Granted by an admin. Shown as a badge «يرسل الإشعارات» in the users list.

### 2.2 Board role (per board)

| Role | Can |
|---|---|
| `VIEWER` (مشاهد) | Read-only: open the board, cards, subtasks, comments, attachments, history. **No** add / edit / move / assign / comment / upload. Cannot be assigned work. UI shows a banner **«للعرض فقط»** in board header and card details and hides all write controls. |
| `MEMBER` (عضو) | Everything above + create/edit/move/delete lists, cards, subtasks; comment; upload; assign; edit board name/description. |
| `OWNER` (مالك) | Everything + archive/restore the board, delete the board, add/remove members, switch a member between عضو/مشاهد, see «ملخّص اللوحة», manage task templates, «حفظ كقالب». The creator of a board is automatically its OWNER. An OWNER can never be removed or demoted. |

### 2.3 Special access rules that affect UI

- **Archived board = read-only for everyone**, including the owner. Show banner **«مؤرشفة — للقراءة فقط»** + an «استعادة» (restore) button for the owner. All add/move/long-press actions are hidden.
- **Moving a card to «انتهى» (CLOSED)** is allowed only for the **board owner** or the **card's assignees**. For everyone else the "next status" arrow into انتهى is hidden and the «انتهى» option in the move sheet is disabled.
- **Restricted card (`isRestricted`)**: visible only to the board owner, the card creator and an explicit access list. Card face shows a **lock icon**.
- **Deactivated user (معطَّل)**: still appears wherever they had work (assignee lists, members, reports) with a dimmed avatar and a badge **«معطَّل»**, but cannot be newly assigned or added to a board. Rows are non-tappable in pickers unless already selected (then removable only).

---

## 3. Domain glossary (for labels and copy)

| Term | Arabic | Notes |
|---|---|---|
| Board | لوحة | name (≤200 chars), optional description, optional board due date (موعد تسليم اللوحة — never shown when empty), members, lists, task templates |
| List / Status | قائمة / حالة | name + optional status category (colour-coded in the UI); manually created lists have no category |
| Card / Task | بطاقة / مهمة | title (≤300), description (≤10,000), due date (optional, optionally with time-of-day — time UI not built yet), priority, cost, recurrence, assignees, restricted access, subtasks, attachments, comments, history |
| Priority | الأولوية | `LOW` منخفضة · `NORMAL` عادية (default) · `URGENT` عاجل. **Only «عاجل» is visible on the card face** (3px edge bar in the urgent colour). Urgent cards are shown first in a column (display order only). |
| Cost | التكلفة | amount + optional note, shown as a chip e.g. «١٥٠٠ ل.س · فاتورة 42» in card details **only**, never on the card face. Currency symbol is a global admin setting (default «ل.س»). |
| Recurrence | التكرار | none / يومي / أسبوعي (choose weekdays) / شهري (choose day of month). When a recurring card is moved to «انتهى», the next occurrence is auto-created in «جديد» with the same title, description, priority, assignees and the next due date. Card face shows a small ↻ icon next to the due-date chip. |
| Assignees | المسؤولون | several people per card and per subtask; must be board members, not viewers, not deactivated |
| Subtask | مهمة فرعية | title, done/not done, own assignees, manual order; card details show a progress bar «مكتمل / الكل» |
| Attachment | مرفق | any file type, ≤20MB each, ≤10 per card. Images get thumbnails + full-screen viewer; other files show as name + size rows that open externally |
| Comment | تعليق | plain text; only the author can delete their own comment |
| History | السجل | append-only timeline: created, moved (from → to status), renamed, description changed, due date changed, archived/unarchived, assigned/unassigned, cost updated. Merged with comments into one timeline «السجل والتعليقات» |
| Task template | قالب مهمة | per-board, owner-managed: name, title, description, list of subtask titles; pre-fills the "new task" screen |
| Hijri date | التاريخ الهجري | secondary grey line «الموافق ٢٤ ذو القعدة ١٤٤٧» under every due-date option and under the due-date chip |

---

## 4. Authentication & session

### 4.1 Login — «تسجيل الدخول»
- Fields: **اسم المستخدم** (username, not email; case-insensitive) + **كلمة المرور**.
- States: idle · loading · **بيانات غير صحيحة** (wrong credentials) · **الحساب غير مفعّل** (deactivated account) · network error.
- Helper text: no self-registration — contact the administrator to get an account.
- After login the app goes straight to the tabs; session persists (secure storage) until logout or the session expires.

### 4.2 Forced password change — «عيّن كلمة مرور جديدة»
- Shown as a **blocking screen** right after login when the admin reset the user's password to a temporary one.
- Two fields only: new password + confirmation (min 8 chars, must match). No "current password" field.
- Cannot be dismissed; completing it returns to the app. Closing the app before completing returns the user to login.

### 4.3 Session expiry
- When the session cannot be refreshed the user is silently returned to the login screen.

---

## 5. Bottom tab bar (4 tabs)

| Tab | Arabic | Visible to |
|---|---|---|
| Boards | اللوحات | all |
| My tasks | مهامي | all |
| Reports | التقارير | `ADMIN` only (hidden for others) |
| Account | حسابي | all |

Headers of «اللوحات» and «مهامي» carry a **notification bell with an unread-count badge**.

---

## 6. Boards

### 6.1 Boards list — «اللوحات»
- Shows boards the user is a member of, **not archived**, most recently updated first.
- Each board card shows: name, progress bar, overlapping member avatars, counter **«n مهمة · m مكتملة»**, and a board due-date chip (only if set).
- Actions: **«لوحة جديدة»** (bottom sheet), tap → open board, link at the bottom **«اللوحات المؤرشفة (n)»**.
- States: loading skeletons · empty («لا توجد لوحات بعد» + create CTA) · error with retry · pull-to-refresh.

### 6.2 New board sheet — «لوحة جديدة»
- Name (required), description (optional), template choice: **سير عمل المهام** (five statuses, default) or **لوحة فارغة**.

### 6.3 Archived boards — «اللوحات المؤرشفة»
- Same card layout, read-only. Opening one shows the archived banner; owner can restore from the board header.

### 6.4 Board screen (Kanban) — `board/[id]`
Header: back · board name · search icon ⌕ · notification-free · **⋯ menu (owner only)** with «ملخّص اللوحة» and «إعدادات اللوحة». Non-owners get a settings entry that is read-only.

Body:
- **Status chip strip** (horizontal, scrollable, colour-coded by status category). Tapping a chip jumps to that column. The active chip is highlighted and kept in view.
- **One status per screen**: the column fills the screen width; swiping moves exactly one status. Cards of neighbouring statuses are never visible. (Deliberate decision — do not design a multi-column peek.)
- **Card face** shows: title · lock icon if restricted · due-date chip (red when overdue) · ↻ if recurring · assignee avatars · urgent edge bar. (A subtask counter «☑ n/m» is planned but not built.)
- **Move a card**: arrow button «←» on the card = move to the next status (hidden when the next status is انتهى and the user may not close). **Long-press** opens the **move sheet** listing all statuses (current one marked, انتهى disabled when not allowed) plus a **«حذف البطاقة»** action with confirmation.
- **Quick add** (default path): a fixed input bar at the bottom **«مهمة جديدة في {status}»** adds a card to the *active* column with just a title. Field stays focused for adding several in a row; failure shows an inline red line and restores the typed title. Next to it a link **«تفاصيل»** opens the full "new task" screen with the typed title carried over.
- **«انتهى» column**: shows only recent closed cards, with a row **«عرض الأقدم»** at the bottom to load older ones.
- **Search & filter** (⌕): replaces the horizontal columns with a **vertical list grouped by status**; live title search with highlighted matches; filter sheet with **«مهامي فقط»**, by member (searchable when > 6 members, selected members always stay visible), and by priority. Show an active-filter indicator and a clear action.
- **Banners**: «مؤرشفة — للقراءة فقط» (+ «استعادة» for owner) · «للعرض فقط» for viewers.
- All moves/deletes/adds are **optimistic** (UI updates instantly, reverts on failure with an error toast).
- States: loading skeleton · empty column («لا توجد مهام في هذه الحالة») · error with retry.

### 6.5 Board summary sheet — «ملخّص اللوحة» (owner only)
Four figures: **منجز آخر 7 أيام** · **المتأخّرة** · **توزيع الأعباء** (top 3 people by open cards + «و n آخرون») · **تكلفة الشهر** (hidden/“—” when no cost recorded).

### 6.6 Board settings — «إعدادات اللوحة» — `board/[id]/settings`
- Edit **name**, **description**, **board due date** (members can edit name/description; archive/delete/members are owner-only).
- **Members section**: list with avatar, display name, username, role, «معطَّل» badge when deactivated. Owner sees: **«＋ إضافة عضو»**, a role picker per member (**عضو ▾ / مشاهد**), and remove. The OWNER row has no role picker and cannot be removed.
- **Add member sheet**: search field (by name or username) showing first candidates immediately; results exclude current members and deactivated users; choose role (**عضو** or **مشاهد**) then add in one tap. Empty-result hint for admins: accounts are created from «حسابي ← المستخدمون والصلاحيات».
- **Task templates section — «قوالب المهام»** (owner): list, rename, delete. (Creation happens from a card via «حفظ كقالب».)
- **Danger zone**: **«أرشفة اللوحة»** (owner; makes it read-only; reversible) and **«حذف اللوحة»** (owner; permanent; full confirmation sheet).

---

## 7. Tasks (cards)

### 7.1 New task — full screen — «إضافة مهمة» — `board/[id]/cards/new`
Opened from «تفاصيل» next to the quick-add bar. Everything is optional except the title.
- **«استخدام قالب ▾»** row at the top (only if the board has templates) → template picker sheet → pre-fills title, description and subtasks (still editable).
- Title · Description · **Status** (defaults to the active column) · **Due date** (quick picks: اليوم · غدًا · بعد 3 أيام · الأسبوع القادم · none, each with the Hijri line) · **Recurrence** row → recurrence sheet · **Priority** segmented control (منخفضة / عادية / عاجل) · **Assignees** (picker sheet) · **Subtasks** (add several rows before saving) · **Restricted access** toggle + access list picker.
- Creation is multi-step; on partial failure show which step failed with **«إعادة المحاولة»** that resumes from that step.

### 7.2 Card details — `card/[id]` (modal over the board)
Header: back/close · **⋯ menu** with **«حفظ كقالب»** (owner only), archive, delete.
Sections (top to bottom, all inline-editable for members, read-only for viewers/archived):
1. **Title** (tap to edit) and **status chip** (tap → move sheet).
2. **Banners** «للعرض فقط» / «مؤرشفة» when applicable.
3. **Meta chips row**: due date (red if overdue, Hijri line under it) · priority chip (tap cycles / opens choice; saves instantly) · **recurrence chip** (tap → recurrence sheet with «إيقاف التكرار») · **cost row/chip** (tap → cost sheet: amount + optional note; shows «— إضافة تكلفة» when empty).
4. **Description** (multiline edit, save/cancel).
5. **المسؤولون** — avatar chips + «+» → assignee picker sheet (search when > 6 members; selected shown as removable chips above the list; viewers never listed; deactivated rows dimmed).
6. **تقييد الوصول** — toggle; when on, an access-list picker (same component as assignees).
7. **المهام الفرعية** — progress bar «n/m مكتمل», rows with checkbox, title, assignee avatars, swipe/⋯ to delete, per-row assign; input to add a new subtask at the bottom. Optimistic.
8. **المرفقات** — grid of image thumbnails (tap → full-screen viewer) and file rows (name, size, open); **«＋ إضافة»** → sheet with **الكاميرا / المعرض / ملف**; upload progress; delete allowed for uploader, board owner or card creator. Limits: 20MB, 10 files.
9. **السجل والتعليقات** — single chronological timeline mixing system events (created, moved from→to, renamed, due date changed, assigned, cost updated, archived…) and user comments (avatar, name, time, body; author can delete). Comment input pinned at the bottom (hidden for viewers/archived).

### 7.3 Move sheet — «نقل إلى…»
List of all statuses with colour dot; current status marked; «انتهى» disabled with a hint when the user is not allowed; **«حذف البطاقة»** at the bottom (confirmation sheet).

### 7.4 Due date sheet
Quick options (اليوم · غدًا · بعد 3 أيام · الأسبوع القادم) + **«بدون موعد»**, each with the Hijri equivalent underneath. A full calendar picker and a **time-of-day** picker are wanted for the new design but not built yet — design them.

### 7.5 Recurrence sheet
Options: بدون · يومي · أسبوعي (weekday chips, multi-select) · شهري (day-of-month picker) · live summary line («يتكرر كل أسبوع: الإثنين، الأربعاء») · «إيقاف التكرار».

### 7.6 Cost sheet
Amount (numeric) with the currency symbol suffix, optional note, save / remove cost.

### 7.7 Save as template sheet — «حفظ كقالب» (owner)
Single field: template name. Explains that the card's current title, description and subtasks will be saved.

---

## 8. My tasks — «مهامي»
- Everything assigned to me across all boards: cards assigned to me **and** subtasks assigned to me (subtask rows show the parent card title). Completed (تم التنفيذ/انتهى) and archived items are excluded.
- Layout: section **«متأخّرة»** first (all boards merged, overdue in red), then the rest **grouped by board**. Within a group: urgent first.
- Row: title · board name (or parent card for subtasks) · due-date chip · priority marker · avatars. Tap → card details.
- Header: notification bell. States: loading · empty («لا توجد مهام مسندة إليك») · error with retry.

---

## 9. Notifications

### 9.1 Bell + badge
In «اللوحات» and «مهامي» headers; unread count badge; also mirrored on the app icon badge.

### 9.2 Notification centre — «الإشعارات»
- Grouped **اليوم / أمس / أقدم**. Unread rows visually distinct. Tap → opens the card and marks it read. **«تعليم الكل كمقروء»** action.
- Types and Arabic copy (single source, keep consistent with push text):
  - `ASSIGNED` — أُسندت إليك مهمة
  - `DUE_SOON` — موعد المهمة يقترب (within 24h)
  - `OVERDUE` — تأخّرت المهمة
  - `COMMENT` — تعليق جديد على مهمة تخصّك
  - `CARD_CLOSED` — مهمة أنشأتها انتقلت إلى «انتهى»
- The actor never gets a notification for their own action.

### 9.3 Push notifications (OS level)
Same events delivered as system notifications when the app is closed/background; tapping opens the card. Permission is asked once.

### 9.4 Notification preferences (in «حسابي»)
Three toggles, all on by default:
- **الإسناد والتعليقات** (ASSIGNED, COMMENT)
- **المواعيد والتأخير** (DUE_SOON, OVERDUE)
- **نقل مهامي** (CARD_CLOSED)

### 9.5 Send notification — «إرسال إشعار» (admin or users with permission)
- Fields: title, body. Target: **كل الأجهزة** / **أجهزة محدّدة** (searchable device list by user name, username or device id; selected stay visible) / **مستخدمون محدّدون**.
- Result: «أُرسل إلى n من m جهاز». Error state when push is not configured on the server.
- Diagnostics block: this device's id (copyable), registration status or failure reason, **«إعادة التسجيل»**.

---

## 10. Account — «حسابي»
- **User card**: avatar initials, display name, username, system role badge (مشرف). Tap → **«تعديل بياناتي»** sheet (display name only; username and email shown read-only with a note that the admin changes them).
- **«تغيير كلمة المرور»** sheet: current, new, confirm (min 8, must match; error «كلمة المرور الحالية غير صحيحة»).
- **Notification preferences** section (9.4).
- **«إرسال إشعار»** entry (only when permitted).
- **Admin-only**: **«المستخدمون والصلاحيات»** entry · **«رمز العملة»** setting (text field, default ل.س, applies app-wide).
- **«تسجيل الخروج»**.
- **Version / update footer** at the very bottom, under logout (quiet and centred, not a card): «الإصدار {version}»; one status line — «آخر تحديث {date}» (running an OTA update), «يعمل التطبيق بالنسخة المثبَّتة دون تحديثات» (running the APK's own bundle) or «جارٍ تنزيل تحديث جديد...», in red only for problems (a downloaded update failed to start, updates disabled in this build, the last check or download failed); `runtime {x}` and `update {first 8 chars of the update id}` for support; a **«نسخ التفاصيل»** link (→ «تم النسخ») copies the full diagnostics. OTA updates themselves still apply silently, with no prompt.

---

## 11. Admin — «المستخدمون والصلاحيات» (ADMIN only)
- Searchable, paginated list (search by username, display name, email) with **clear ✕**. Row: avatar, display name, username, email (if any), role badge (مشرف/مستخدم), status (مفعّل/معطَّل), badge «يرسل الإشعارات», board count.
- **«+» new user** sheet: username (3–50 chars, lowercase letters/digits/`.`/`_`/`-`), display name, password (≥8), optional email, role. Duplicate errors shown **inside the sheet**. In the «لا نتائج» state, a button **«إنشاء مستخدم «{search}»»** opens the sheet pre-filled.
- Per-user actions:
  - **«تعديل البيانات»** (display name, email — username read-only)
  - **Role toggle** مستخدم ⇄ مشرف (cannot demote yourself or the last active admin)
  - **Activate / deactivate** (cannot deactivate yourself or the last active admin); deactivation keeps their history and memberships
  - **«إعادة تعيين كلمة المرور»** → result sheet showing a one-time temporary password (copy/share); the user will be forced to change it at next login
  - **«السماح بإرسال الإشعارات» / «منع إرسال الإشعارات»** (USER rows only)
  - **«حذف الحساب»** — shown only when the account has no content (never owned a board, created a card, comment, attachment or subtask) and is not yourself; full confirmation sheet; otherwise deactivation is the path.

---

## 12. Reports — «التقارير» (ADMIN only)
Four tabs, each a simplified list, plus a header **export** button:
1. **نظرة عامة** — per board: total tasks, count per status, **cost this month** («—» when none).
2. **المُنجَز** — tasks moved to تم التنفيذ since a date (default last 7 days); date-range control.
3. **المتأخّرة** — overdue open tasks across all boards with board name, assignees, due date.
4. **عبء العمل** — open tasks per person, sorted by load; deactivated people shown with «معطَّل» badge and subtle red tint, not removed.
Archived boards are excluded everywhere.

**Export sheet — «تصدير PDF — تقرير {التبويب}»**: «تصدير» → generating spinner → system share sheet; error state «تعذّر التوليد — إعادة المحاولة».

---

## 13. Cross-cutting UI patterns to design

- **Bottom sheets** are the primary pattern for every secondary action (new board, new user, move, due date, recurrence, cost, pickers, confirmations). Sheets must handle the keyboard and scroll internally.
- **Confirmation sheet** (single shared component) for destructive actions: delete card/board/account/comment/attachment, remove member. Title, explanation, destructive button, cancel.
- **People pickers** — one shared behaviour everywhere a person is chosen (assignees, subtask assignees, access list, board filter, push targets, add member): search appears when more than 6 candidates; selected people shown as removable chips above the list; deactivated dimmed + badge; viewers excluded from assignment.
- **Status colours** — each status category has its own colour (NEW, READY, IN_PROGRESS, REVIEW (legacy), DONE, CLOSED) used consistently in chips, dots and headers; manually created lists get a neutral colour.
- **Urgent colour** — a dedicated accent (currently `#C05A17`) used only for «عاجل».
- **Overdue** — red due-date chip; «متأخّرة» sections.
- **Avatars** — initials-based (no profile photos in the product), overlapping stacks with «+n».
- **Screen states for every list**: loading skeletons, empty state with a CTA, error with «إعادة المحاولة», pull-to-refresh.
- **Optimistic actions** with inline error + revert (no blocking spinners for move/add/complete/delete).
- **Read-only modes**: viewer and archived board — same screens with all write controls removed and a banner, not a different screen.
- **Numbers and dates**: Arabic-Indic or Western digits is a design decision — be consistent. Gregorian date always primary, Hijri secondary in small grey.
- **Android specifics**: edge-to-edge, gesture bar; bottom tab bar and sheets must respect the system inset.

---

## 14. Explicitly not in scope (do not design around them unless flagged as future)

- Drag-and-drop reordering of cards or lists (mobile uses arrow + move sheet).
- Real-time collaboration indicators (no live presence / live updates; data refreshes on focus, notifications every 30s).
- Labels/tags, card colours, card cover images.
- Profile photos.
- Organisations / workspaces above boards.
- iOS-specific push behaviour.
- Time-of-day picker for due dates and a full calendar picker — **wanted, not built**; please include them in the new design.
- Subtask counter on the card face — **wanted, not built**; include it.
- Copying subtasks and cost to the next recurring instance (rules say they are not copied).

---

## 15. Screen inventory checklist for the design deliverable

1. Login (idle / loading / wrong credentials / deactivated / offline)
2. Forced new-password screen
3. Boards list (+ empty, loading, error) · New board sheet · Archived boards
4. Board screen: columns + chip strip · card face variants (normal, urgent, overdue, restricted, recurring, with avatars) · quick-add bar · move sheet · long-press · search & filter mode · filter sheet · archived banner · viewer banner · «عرض الأقدم»
5. Board summary sheet
6. Board settings: info · members (owner vs member view) · add member sheet · role picker · templates section · archive / delete confirmations
7. New task (full) · template picker sheet
8. Card details (member view, viewer view, archived view) · due date sheet · recurrence sheet · cost sheet · priority control · assignee/access picker sheet · subtasks · attachments (+ add sheet, image viewer) · history & comments · save-as-template sheet · ⋯ menu
9. My tasks (overdue section, grouped by board, empty state)
10. Notification centre · bell badge · push notification appearance
11. Account · edit profile sheet · change password sheet · notification prefs · currency setting (admin)
12. Users & permissions (admin): list, search, empty-with-create, new user sheet, edit user sheet, reset-password result sheet, role/status/permission actions, delete confirmation
13. Send notification screen (targets, result, diagnostics)
14. Reports: 4 tabs · export sheet (generating / error)
15. Shared: confirmation sheet, toasts/inline errors, skeletons, empty states, tab bar
