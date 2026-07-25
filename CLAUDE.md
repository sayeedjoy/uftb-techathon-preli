# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SCS-RG — a multi-hazard campus safety platform. Sensor zones POST **raw** readings;
the backend is the sole authority for validation, risk fusion, state classification,
incident lifecycle, priority ranking and actuation. A React command dashboard renders
the live picture over REST snapshots + Socket.IO.

pnpm workspace with three packages: `packages/shared` (`@scsrg/shared`), `backend`, `frontend`.

## Commands

```bash
pnpm install
pnpm db:up                          # Docker Postgres 18 on host port 5433 (NOT 5432)
pnpm --filter @scsrg/shared build   # required before backend/frontend typecheck or build
pnpm db:migrate && pnpm db:seed
pnpm dev                            # shared --watch + backend :4000 + frontend :5173
```

Gates: `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` (shared → backend → frontend).

Database: `pnpm db:reset`, `db:seed:load` (bulk history), `db:explain` (EXPLAIN ANALYZE gate — exits
non-zero on a seq scan in a hot query), `db:studio`, `db:backup`.

Demo/ops: `pnpm sim:scenario -- --id 5` (or `--all`, headless, fails the shell on a bad assertion),
`pnpm sim:load -- --zones 30 --hz 5`, `pnpm ml:train`, `pnpm docs:openapi`.

### Running a subset of tests

```bash
pnpm --filter backend test:unit                    # src/**/*.test.ts, excludes src/tests/**
pnpm --filter backend test:integration             # src/tests/**, needs Postgres up
pnpm --filter backend exec vitest run src/modules/risk-engine/risk.service.test.ts
pnpm --filter backend exec vitest run --project integration -t "acknowledgment race"
pnpm --filter frontend exec vitest run src/features/dashboard/command-center.test.tsx
```

Integration tests run against a dedicated `scsrg_test` database (`src/tests/global-setup.ts` runs
`prisma migrate deploy` against it and overrides env: `BCRYPT_ROUNDS=4`, `GAS_WARMUP_MS=0`, short
offline timeout, sweeper pushed out of reach). They are deliberately **single-threaded** and truncate
all tables _before_ each test — a failed test leaves its rows for inspection. Order-independence is
a hard requirement; do not add parallelism.

## Non-negotiable invariants

These are enforced by tests, database constraints or the type system. Breaking one is a regression,
not a refactor.

1. **A sensor node is never trusted with a computed value.** A payload carrying `riskScore`, `state`,
   `priority` or an incident status is rejected with `400` — never silently stripped. Schema shape
   errors are `400`; semantically impossible values are `422`.
2. **Engines are pure.** `risk-engine`, `priority-engine` and `actuation.resolver` take config and an
   injected `Clock` (`src/shared/clock.ts`) — no I/O, no database, no `Date.now()`. There is no
   `sleep()` anywhere in the test suite; every timing rule is driven by a fake clock.
3. **Prisma appears only in repositories.** Services hold rules and never import the Prisma client.
   Repositories accept either the root client or an open transaction (`PrismaTx`), so a service can
   compose several into one atomic unit. Layering: `routes → controller → service → repository → Prisma`.
4. **Ingestion steps 9–14 are one transaction; the socket broadcast sits outside it.** A rolled-back
   write must never announce itself, and no network work holds a row lock.
5. **One active incident per zone is a Postgres partial unique index**, not application logic —
   `prisma/migrations/20260724192500_partial_unique_indexes/migration.sql` (hand-written; Prisma's DSL
   cannot express it). The app only catches the violation. If that index goes missing, the guarantee
   goes with it.
6. **Every in-memory map is a cache, never the only copy.** Debounce counters, gas warm-up, occupancy,
   water phase, recovery counters each expose `rehydrate()`; `src/bootstrap/` rebuilds all of them from
   Postgres _before_ the HTTP listener binds.
7. **Offline means unknown, not safe.** A silent zone keeps its incident open and its actuators on.
8. **The prediction module (bonus 2) may not touch the hazard path.** `src/tests/architecture/prediction-boundaries.test.ts`
   scans the import graph — adding an import of actuation/incidents/zone-state there fails the build.
   Trend, prediction and NL field reports are advisory only.
9. **An AI provider is never on the hazard path and never authors user-facing safety text.**
   `AI_PROVIDER` (OpenRouter primary → Groq fallback → deterministic floor) only affects how free
   text is _read_. Every extraction — LLM or deterministic — passes the identical
   `applyValidationGate`, the confirmation message is always composed by `buildConfirmation()`
   locally, and the result is a `PENDING` report that cannot open an incident or actuate. Keys and
   model names live in `backend/.env` and never reach the browser. See `docs/ai-provider.md`.

## Where things live

**`packages/shared`** is the wire contract: domain enums, Zod schemas, `ApiResponse<T>` envelope, and
the Socket.IO event map. Both apps typecheck against it, so a DTO cannot drift on one side only.
**Any change to a request/response/event shape starts here**, then `pnpm --filter @scsrg/shared build`
(or rely on `pnpm dev`, which watches it). `Cannot find module '@scsrg/shared'` always means `dist/`
is stale.

**`backend/src/modules/<capability>/`** — one folder per capability holding controller, service,
repository, routes and colocated unit tests. `src/config/` holds Zod-validated env (`env.ts`) plus
`risk.config.ts`, `priority.config.ts`, `sensor.config.ts` — risk weights, thresholds, hysteresis and
debounce counts are **configuration, not constants**. The process refuses to boot on an invalid value.
All routers mount under `/api/v1` via `src/routes/index.ts`; Swagger at `/api/v1/docs`.

**`backend/src/realtime/emitter.ts`** is the only way a domain event reaches a client. It stamps every
payload with a fresh `eventId` and `emittedAt` — that stamping is what makes browser de-duplication
possible.

**`frontend/src`** — TanStack Query owns all server data. Socket events **patch or invalidate** that
cache and are never a parallel source of truth. Two subtleties worth preserving:

- De-duplication happens **once**, at the single `onAny` reader in `hooks/use-socket.tsx`, before
  events fan out through `lib/event-bus.ts`. Doing it per subscriber looks equivalent and is not: the
  first hook to register would consume the `eventId` and every other hook would silently miss the
  event. `features/dashboard/command-center.test.tsx` exists because that regression happened.
- On connect _and every reconnect_, the four snapshot queries (`SNAPSHOT_QUERY_KEYS`) are refetched,
  so a client that missed events while disconnected converges rather than showing a stale picture.
  Events predating the current connection are applied but raise no toast (`isBackdated`).

`lib/api.ts` is the single fetch wrapper: it unwraps the envelope and throws a typed `ApiError`
carrying the machine-readable code. A `409` on acknowledge is an expected outcome, not a failure.

## Conventions

- ESM everywhere. Backend relative imports carry the `.js` extension (`./risk.service.js`); it compiles
  with `tsc` + `tsc-alias`, not a bundler.
- `@/` aliases `src/` in backend, frontend and their vitest configs.
- TypeScript is strict with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`.
- Prettier (no semicolons, 2-space) + `prettier-plugin-tailwindcss`. `pnpm format`.
- Frontend UI is shadcn/ui on Tailwind 4 (`components/ui/` is generated — prefer composing over editing).
- Coverage thresholds are enforced per-module in `backend/vitest.config.ts`: 90% on the risk and
  priority engines, 80% on ingestion/incidents/acknowledgments/actuation.

## Local environment

Postgres is bound to **5433** because a local install usually owns 5432. Config lives in
`backend/.env` and `frontend/.env` (copy from the `.env.example` beside each); the root `.env` only
feeds `docker-compose.yml`. `JWT_SECRET` must be ≥32 characters.

Zone API keys are bcrypt-hashed in the database and printed once by `pnpm db:seed` into
`backend/.dev-zone-keys.json` and `backend/.env.simulator` (both gitignored). Keys rotate on every
seed by design; re-print with `pnpm --filter backend print-zone-keys`. **No zone API key ever reaches
the browser** — the simulator drives the real HTTP API from the server using server-held keys.

Seeded dev logins (local demo only): `admin@scsrg.local` / `Admin123!` and
`security@scsrg.local` / `Security123!`.

## Deeper reference

`docs/` is current and worth reading before non-trivial changes: `architecture.md`, `api.md`,
`database-schema.md`, `risk-fusion.md` (the formula and _why_ those weights), `priority-ranking.md`,
`security.md`, `resilience.md`, `demo-scenarios.md`, `data-retention.md`, `ml-model.md`,
`ai-provider.md` (the OpenRouter → Groq → deterministic extraction chain).
`specs-and-planning/` holds the original spec, plan and task breakdown.
