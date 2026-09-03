# Kanban Board System

A Trello-style Kanban board: boards → lists (columns) → cards, with drag-and-drop
reordering. This repo contains a NestJS API, a React web app, and an
Expo/React Native mobile app under construction in `apps/mobile`. Realtime
collaboration is a planned follow-up phase (see [Roadmap](#roadmap) below).

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript, [NestJS](https://nestjs.com/), [PostgreSQL](https://www.postgresql.org/), [Prisma](https://www.prisma.io/) |
| Web frontend | React + TypeScript + [Vite](https://vitejs.dev/), Tailwind CSS, [dnd-kit](https://dndkit.com/) for drag-and-drop, [TanStack Query](https://tanstack.com/query) |
| Mobile app | [Expo](https://expo.dev/) SDK 57 / React Native + [expo-router](https://docs.expo.dev/router/introduction/), TanStack Query, RTL + Cairo |
| Auth | JWT access tokens + rotating refresh tokens |
| Monorepo | [Turborepo](https://turbo.build/) + pnpm workspaces |

**Why these choices:** TypeScript end-to-end lets `packages/types` be the single
source of truth for API contracts shared by the backend and frontend. Postgres
fits the relational board → list → card hierarchy. dnd-kit has the most mature
support for the kind of multi-container sortable UI a Kanban board needs.

## Project structure

```
apps/
  api/            NestJS backend
    src/
      auth/       JWT login/refresh/logout + self change-password
      boards/     Board CRUD, membership + roles (owner/member)
      lists/      List CRUD + reorder
      cards/      Card CRUD + move/reorder (incl. across lists)
      common/     Guards, decorators, validation pipe, position-move helper
      prisma/     Prisma client wrapper
    prisma/
      schema.prisma
      migrations/
  web/            React + Vite + Tailwind + dnd-kit
    src/
      features/auth/    Login + account (change-password) pages, auth context
      features/boards/  Boards list, board view, drag-and-drop, card modal
      lib/               API client wiring, token storage, React Query setup
  mobile/         Expo / React Native (expo-router), RTL + Cairo
    src/
      app/        File-based routes: login + the (tabs) shell
      components/ Shared primitives (text, screen, button, skeletons, states)
      features/   Per-feature logic (auth, boards, ...)
      lib/        API client instance, SecureStore tokens, React Query setup
      theme/      Design tokens — the single source for colours/radii/spacing

packages/
  types/          Shared zod schemas/DTOs (domain models, request bodies,
                  realtime event contracts used by both api and web)
  api-client/     The API client shared by web and mobile: attaches the access
                  token, transparently refreshes once on a 401 (de-duplicated),
                  retries. Token storage and the session-expired action are
                  injected, since they are the only platform-specific parts.
  ordering/       Fractional-index ("LexoRank"-style) key generator — the
                  core drag-and-drop correctness logic, unit tested in
                  isolation (including a simulated concurrent-move sequence)
  config/         Shared eslint/tsconfig base
```

### Why fractional-index positions

Cards and lists store `position` as a lexicographically-sortable string
instead of an integer index. Moving one item only ever requires writing that
one row — never renumbering its siblings — which keeps drags cheap under
concurrent edits and is what will let a future realtime layer broadcast tiny
diffs (`{ cardId, position }`) instead of whole-board snapshots. See
`packages/ordering/src/index.ts` and its test suite for the algorithm and
correctness tests.

### Data model

```
User            id, email, passwordHash, displayName
RefreshToken    id, userId, tokenHash, expiresAt, revokedAt

Board           id, name, description, ownerId, isArchived
BoardMember     boardId, userId, role (OWNER | MEMBER)

List            id, boardId, name, position, isArchived
Card            id, listId, boardId, title, description, dueDate,
                position, createdById, isArchived
```

Deliberately left out of this MVP (all additive later, none require touching
the existing hierarchy): labels, comments, attachments, assignees, activity
log, and a multi-tenant "Organization" layer above boards.

### API surface

REST, JSON, JWT bearer auth on everything except `/auth/*`:

- **Auth:** `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/change-password`, `GET /auth/me` (no public registration — accounts are created by an admin)
- **Admin users:** `GET/POST /admin/users`, `PATCH /admin/users/:id/{password,role,status}` (ADMIN only)
- **Boards:** `GET/POST /boards`, `GET/PATCH/DELETE /boards/:id`, `POST/DELETE /boards/:id/members[/:userId]`
- **Lists:** `POST /boards/:boardId/lists`, `PATCH/DELETE /lists/:id`
- **Cards:** `POST /lists/:listId/cards`, `GET/PATCH/DELETE /cards/:id`

Reordering is a `PATCH` with an optional `move: { beforeId, afterId }`
referencing neighbor IDs (not raw position strings) — the server re-reads
current neighbor positions fresh inside a transaction and computes the new
key itself, so a stale client-side drag can never corrupt ordering.

## Running locally

**Prerequisites:** Node 20+, pnpm, a PostgreSQL 16 instance (via
`docker compose up -d postgres`, or a native install).

```bash
pnpm install

cd apps/api
cp .env.example .env        # then fill in real JWT secrets
npx prisma migrate dev      # applies the schema to your database

cd ../..
pnpm dev                    # runs api (port 3000) and web (port 5173) together
```

Open http://localhost:5173, sign in with the seeded admin account
(`prisma/seed.ts`), create a board, and drag cards between lists. New user
accounts are provisioned from the admin users page — there is no public
sign-up.

### Running the mobile app

```bash
cd apps/mobile
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your machine's LAN
                            # address — a phone cannot reach your localhost
cd ../..
pnpm --filter @app/mobile dev
```

Then scan the QR code with Expo Go, or press `a`/`i` for an emulator. Note the
app forces RTL: in Expo Go the *first* launch may render left-to-right until you
reload, because React Native only picks up a direction change on restart and
config plugins do not apply in Expo Go. A dev build is correct from the first
frame.

### Running tests

```bash
pnpm test                               # everything below, via turbo
pnpm --filter @app/ordering test        # fractional-index unit tests
pnpm --filter @app/api-client test      # session behaviour: token attach,
                                        # refresh-on-401, single-flight refresh
pnpm --filter @app/mobile bundle:check  # proves the Expo app still bundles
```

`bundle:check` runs `expo export` for Android. It is the only automated proof
the mobile app builds in an environment with no device or emulator — it catches
Metro module-resolution breakage that `pnpm typecheck` cannot see. Actual
rendering (RTL layout, Cairo, gestures) still has to be checked by running
`pnpm --filter @app/mobile dev` and opening the app.

The API and web app have been verified end-to-end manually (login
→ board/list/card CRUD → drag-and-drop across lists, within a list, and list
reordering, all confirmed to persist through a page reload) but do not yet
have an automated e2e test suite — see [Roadmap](#roadmap).

## Roadmap

Phases not yet built, in planned order:

1. **Realtime collaboration** — a Socket.IO gateway broadcasting per-board
   events (`card.moved`, `card.created`, ...) so multiple users see edits
   live. The fractional-index data model above was chosen specifically so
   this slots in as small, additive event payloads rather than a rewrite.
2. **Mobile app** — Expo/React Native, reusing `packages/types` and the
   shared `packages/api-client`, with a simpler "move to list" affordance in
   place of full drag-and-drop and a foreground-only realtime connection.
   The full designed feature set (`docs/app_design/v2-new-style.md` +
   `design-prompt-group-3.md`, groups 1a/2a/3a/3b/3c) is now built — see
   `docs/12-mobile-app.md` and `docs/13-redesign-completion-plan.md` for
   what shipped and what's still explicitly deferred (a Reports tab was
   also added as part of this, ahead of its original placement below).
3. **Automated backend e2e tests** (NestJS + supertest) covering auth,
   CRUD, and concurrent-move scenarios.
4. **Further features**, additive to the current schema: labels, an
   activity/notification feed spanning boards (today's is per-card), a
   real Unicode-bidi/shaping library for the PDF report exporter (see the
   known limitation in `docs/11-reports.md`), and a due-time picker for
   `Card.dueDateHasTime` (written end-to-end already, no UI yet).
