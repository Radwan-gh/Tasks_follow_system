# 2. Domain Model

The authoritative source for this model is the database schema in
`apps/api/prisma/schema.prisma`; its shapes are mirrored in the zod schemas
under `packages/types/src/domain.ts`.

## Entities and relations

```
User
 ├── ownedBoards      : boards owned          (Board.ownerId)
 ├── boardMemberships : board memberships     (BoardMember)
 ├── createdCards     : cards created         (Card.createdById)
 ├── refreshTokens    : refresh tokens        (RefreshToken)
 ├── comments         : comments written      (Comment)
 ├── attachments      : attachments uploaded  (Attachment)
 └── notifications    : notifications         (Notification)

Board
 ├── owner     : the owner (User)
 ├── members   : members (BoardMember[])
 ├── lists     : lists (List[])
 └── templates : board-scoped task templates (Template[])

List
 ├── board : belongs to a board
 └── cards : cards (Card[])

Card
 ├── list        : belongs to a list
 ├── board       : carries boardId directly (speeds up queries/authorization)
 ├── createdBy   : who created it (User)
 ├── assignees   : assigned to (CardAssignee[] — several people)
 ├── subtasks    : subtasks (Subtask[])
 ├── comments    : comments (Comment[])
 └── attachments : attached images (Attachment[])

Subtask
 ├── card      : belongs to a card
 └── assignees : assigned to (SubtaskAssignee[])

Comment ─ card, author
Attachment ─ card, uploader
Notification ─ user
Template ─ board
AppSettings (single global row, no relations)
```

## Entities in detail

### User

| Field | Type | Business-logic notes |
|---|---|---|
| `id` | id (cuid) | Primary key |
| `email` | unique string | Used for login and for adding a member to a board |
| `passwordHash` | string | bcrypt hash — **the raw password is never stored** |
| `displayName` | string | Display name |
| `role` | `USER` \| `ADMIN` | Role at the **whole-system** level (default `USER`) |
| `isActive` | boolean | If `false`, login is blocked and sessions are revoked (default `true`) |
| `notificationPrefs` | optional JSON | Three notification-preference toggles (assignment/comments · due-dates/overdue · my cards moved), all `true` by default — see `NotificationPrefsSchema` |
| `mustChangePassword` | boolean | Set by `POST /admin/users/:id/reset-password` (default `false`), cleared automatically by `POST /auth/change-password` — see [`14-notifications-comments-attachments.md`](./14-notifications-comments-attachments.md#password-reset) |
| `createdAt` | date | Creation time |

### RefreshToken

Only a **SHA-256 hash** of the token is stored (`tokenHash`), never the raw
token. Detailed in [`03-authentication.md`](./03-authentication.md).

| Field | Notes |
|---|---|
| `id` | Equal to the `jti` claim inside the token |
| `userId` | Owner of the token |
| `tokenHash` | SHA-256 hash of the raw token |
| `expiresAt` | Expiry time |
| `revokedAt` | Revocation time (null = still valid) |

### Board

| Field | Business-logic notes |
|---|---|
| `id` | Primary key |
| `name` | Name (1 to 200 characters) |
| `description` | Optional description (up to 2000 characters) |
| `dueDate` | Optional board-level target completion date — never rendered when `null` (no placeholder text, no empty field) |
| `ownerId` | The board's owner (auto-added as a member with role `OWNER` on creation) |
| `isArchived` | If `true`, the board disappears from normal listings; archiving requires the `OWNER` role |
| `updatedAt` | Used to sort the boards list (most recently updated first) |

### BoardMember

The join table between a user and a board, carrying **the user's role within
that board**.

| Field | Notes |
|---|---|
| `boardId` + `userId` | **Unique** composite key — a user cannot be a member of the same board twice |
| `role` | `OWNER` \| `MEMBER` \| `VIEWER` (default `MEMBER`). `VIEWER` is fully read-only and enforced server-side (`BoardsService.assertMembership`'s `ROLE_RANK`) — see [`04-authorization.md`](./04-authorization.md). Assigned via `POST /boards/:id/members`'s optional `role`, or switched on an existing member via `PATCH /boards/:id/members/:userId/role` (owner-only, never to/from `OWNER`) |
| `joinedAt` | Time joined |

### List

| Field | Business-logic notes |
|---|---|
| `boardId` | The board it belongs to |
| `name` | Name (1 to 200 characters) |
| `position` | A **lexicographically-sortable string** (not a number) — see [`06-ordering.md`](./06-ordering.md) |
| `isArchived` | Archived lists are excluded from display and ordering |
| `statusCategory` | Optional status category (`NEW`/`READY`/`IN_PROGRESS`/`REVIEW`/`DONE`/`CLOSED`) — set when seeded from a template; `null` for manually created lists. `REVIEW` is retired from the current template but stays valid for older lists. See [`09-list-status-templates.md`](./09-list-status-templates.md) |

### Card

| Field | Business-logic notes |
|---|---|
| `listId` | Current list |
| `boardId` | **Deliberately duplicated** from the list to speed up authorization checks and queries without an extra join |
| `title` | Title (1 to 300 characters) |
| `description` | Optional description (up to 10,000 characters) |
| `position` | Lexicographically-sortable string within the list |
| `dueDate` | Optional due date |
| `dueDateHasTime` | Whether `dueDate` carries a meaningful time-of-day (§3c-5) — `dueDate` is always a full timestamp, this flag says whether the client should render/use its time component or treat it as date-only. Default `false` |
| `createdById` | Who created the card |
| `isArchived` | Archived cards are excluded from display |
| `isRestricted` | If `true`, visibility is limited to `CardMember` + the board owner + the creator |
| `assignees` | Assigned to, via `CardAssignee` (several people) — see [`10-subtasks-and-assignment.md`](./10-subtasks-and-assignment.md). A `VIEWER` board member can never be an assignee |
| `priority` | `LOW` \| `NORMAL` (default) \| `URGENT`. Only "urgent" shows on the card face |
| `costAmount` / `costNote` | Optional cost (decimal amount + free-text note), never shown on the card face — a details-screen-only chip, written via `POST .../cards`/`PATCH /cards/:id`. Changing it records a `COST_UPDATED` activity |
| `recurrence` | Optional repeat rule (`RecurrenceRule` in `packages/types`: daily / weekly with weekdays / monthly with a day), actually written via `POST .../cards` and `PATCH /cards/:id`. Moving into "closed" spawns the next instance in "new" automatically — details in [`14-notifications-comments-attachments.md`](./14-notifications-comments-attachments.md#recurring-task-generation) |

### Comment — Attachment — Notification — Template — AppSettings

| Entity | Purpose | Notes |
|---|---|---|
| `Comment` | A text comment on a card | `cardId`, `authorId`, `body`, `createdAt`. Merged with `CardActivity` into one timeline on the client, not one schema on the server. Live endpoints under `/cards/:cardId/comments` — see [`14-notifications-comments-attachments.md`](./14-notifications-comments-attachments.md) |
| `Attachment` | An image attached to a card | `cardId`, `uploaderId`, `filename`, `mimeType`, `sizeBytes`. Files live on the API server's local disk (`apps/api/uploads/`), served via `/uploads/*` — not cloud storage. Live endpoints under `/cards/:cardId/attachments` |
| `Notification` | An in-app notification (no OS push) | `userId`, `type`, `cardId?`, `boardId?`, `payload?`, `readAt?`. Live endpoints under `/notifications` and `/me/notification-prefs` |
| `Template` | A board-scoped task template that prefills title/description/subtasks (§3c-3) | `boardId`, `name`, `titlePattern`, `description?`, `subtaskTitles[]`. Distinct from `TASK_WORKFLOW_TEMPLATE` in `board-templates.ts`, which seeds a **board's lists**, not a card. CRUD under `/boards/:id/templates` (owner-only to write, any member to list) plus `POST /cards/:id/save-as-template` (owner-only — reads the card's current title/description/subtasks server-side) |
| `AppSettings` | Single global-settings row (§3c-1) | One row, fixed id `"global"`, upserted by `SettingsService`. Currently just `currencySymbol` (default `"ل.س"`) — the symbol shown next to every cost amount app-wide. Read via `GET /settings` (any authenticated user), written via `PATCH /admin/settings` (`ADMIN` system role) |

### Subtask

A subtask belonging to a card. Logic detail in [`10-subtasks-and-assignment.md`](./10-subtasks-and-assignment.md).

| Field | Business-logic notes |
|---|---|
| `cardId` | The parent card (cascade delete) |
| `title` | Title (1 to 300 characters) |
| `isDone` | Done / not done (default `false`) |
| `position` | Lexicographically-sortable string within the card |
| `createdById` | Who created the subtask |

### CardAssignee / SubtaskAssignee

Join tables for multi-person assignment. `CardAssignee` links `(cardId,
userId)` and `SubtaskAssignee` links `(subtaskId, userId)`, both **unique** on
the pair. Independent of `CardMember` (the access allow-list): these
represent **responsibility for the work**, not visibility.

## Data-integrity rules

- **Cascade delete:** deleting a board deletes its lists, cards, and
  memberships; deleting a list deletes its cards; deleting a user deletes
  their refresh tokens and memberships. (Defined via `onDelete: Cascade` in
  the schema.)
- **Indexes:** indexes exist on `(boardId, position)` for lists and
  `(listId, position)` for cards to speed up ordered fetches, and on
  `(boardId, isArchived)` for cards.
- **A card's `boardId`** must stay in sync with `list.boardId`; moving a card
  into a list on a different board is therefore blocked (see
  [`05-boards-lists-cards.md`](./05-boards-lists-cards.md)).
