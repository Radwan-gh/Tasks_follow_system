# Kanban Board System

A Trello-style Kanban board: boards → lists (columns) → cards, with drag-and-drop
reordering. This repo currently contains the **web MVP** — a NestJS API and a
React web app. Realtime collaboration and a mobile app are planned follow-up
phases (see [Roadmap](#roadmap) below).

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript, [NestJS](https://nestjs.com/), [PostgreSQL](https://www.postgresql.org/), [Prisma](https://www.prisma.io/) |
| Web frontend | React + TypeScript + [Vite](https://vitejs.dev/), Tailwind CSS, [dnd-kit](https://dndkit.com/) for drag-and-drop, [TanStack Query](https://tanstack.com/query) |
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
      auth/       JWT login/register/refresh/logout
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
      features/auth/    Login/register pages, auth context
      features/boards/  Boards list, board view, drag-and-drop, card modal
      lib/               API client, token storage, React Query setup

packages/
  types/          Shared zod schemas/DTOs (domain models, request bodies,
                  realtime event contracts used by both api and web)
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

- **Auth:** `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`
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

Open http://localhost:5173, register an account, create a board, and drag
cards between lists.

### Running tests

```bash
pnpm --filter @app/ordering test   # fractional-index unit tests
```

The API and web app have been verified end-to-end manually (register → login
→ board/list/card CRUD → drag-and-drop across lists, within a list, and list
reordering, all confirmed to persist through a page reload) but do not yet
have an automated e2e test suite — see [Roadmap](#roadmap).

## Roadmap

Phases not yet built, in planned order:

1. **Realtime collaboration** — a Socket.IO gateway broadcasting per-board
   events (`card.moved`, `card.created`, ...) so multiple users see edits
   live. The fractional-index data model above was chosen specifically so
   this slots in as small, additive event payloads rather than a rewrite.
2. **Mobile app** — Expo/React Native, reusing `packages/types` and a
   shared API client, with a simpler "move to list" affordance in place of
   full drag-and-drop and a foreground-only realtime connection.
3. **Automated backend e2e tests** (NestJS + supertest) covering auth,
   CRUD, and concurrent-move scenarios.
4. **Further features**, all additive to the current schema: labels,
   comments, attachments, activity feed, finer-grained roles.
