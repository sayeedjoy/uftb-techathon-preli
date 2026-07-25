# Task Breakdown: Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)

**Status:** Draft — awaiting human approval
**Phase:** 3 of 4 (SPECIFY ✅ → PLAN ✅ → **TASKS** → IMPLEMENT)
**Derived from:** [spec.md](spec.md) and [plan.md](plan.md)
**Last updated:** 2026-07-25

**74 tasks · 13 phases · 13 checkpoints.** No task touches more than 5 files.

### Standing gate — applies to every task

Beyond each task's own Verification block, a task is not done until:

```bash
pnpm typecheck && pnpm lint && pnpm test     # all green
pnpm dev                                      # backend + frontend still boot
```

### Legend

| Scope | Meaning |
|---|---|
| **XS** | 1 file, single function or config change |
| **S** | 1–2 files, one endpoint / component / service |
| **M** | 3–5 files, one feature slice |

---

# Phase 0 — Workspace Foundation

> Strictly sequential and blocking. Everything downstream depends on the shared contract existing.

## Task 01: Root pnpm workspace, scripts, Prettier, gitignore

**Description:** Convert the repository into a three-package pnpm workspace and establish the shared tooling gates every later task runs against. Delete the stray `frontend/pnpm-workspace.yaml` (`packages: []`) that would otherwise shadow the root workspace. Add the ignore rules for generated secrets **before** any seed exists (plan risk R12).

**Acceptance criteria:**
- [ ] Root `pnpm-workspace.yaml` declares `backend`, `frontend`, `packages/*`; `frontend/pnpm-workspace.yaml` is deleted.
- [ ] Root `package.json` exposes `dev`, `build`, `test`, `lint`, `lint:fix`, `format`, `typecheck` and the `db:*` script family from [spec.md §4](spec.md#4-commands).
- [ ] Root `.prettierrc` mirrors the existing frontend config exactly (no semicolons, double quotes, 2-space, `printWidth: 80`, `trailingComma: "es5"`, LF).
- [ ] `.gitignore` covers `.env`, `.env.*` (except `.example`), `.dev-zone-keys.json`, `.env.simulator`, `dist`, `coverage`, `backups/`.

**Verification:**
- [ ] `pnpm install` resolves the workspace with no lockfile errors.
- [ ] `pnpm typecheck` and `pnpm lint` exit 0 (frontend only at this point).
- [ ] `git status --short` shows no secret-shaped file would be tracked.

**Dependencies:** None

**Files likely touched:**
- `pnpm-workspace.yaml` · `package.json` · `.prettierrc` · `.gitignore` · `frontend/pnpm-workspace.yaml` (delete)

**Estimated scope:** S

---

## Task 02: Docker Compose Postgres + environment templates

**Description:** Stand up PostgreSQL 18 in Compose bound to **host port 5433** (the host already runs psql 18, which likely owns 5432 — plan risk R11), and author the `.env.example` files documenting every configuration key from [spec.md §17](spec.md#17-configuration-reference).

**Acceptance criteria:**
- [ ] `docker-compose.yml` defines a `postgres:18` service with a named volume, healthcheck, and `5433:5432` mapping.
- [ ] `backend/.env.example` contains every key in spec §17 with safe defaults and inline comments.
- [ ] `frontend/.env.example` contains `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, `VITE_ALERT_SOUND_ENABLED`.
- [ ] Root `pnpm db:up` / `pnpm db:down` control the container.

**Verification:**
- [ ] `pnpm db:up` then `docker compose ps` reports healthy.
- [ ] `psql "postgresql://scsrg:scsrg@localhost:5433/scsrg" -c "select 1"` succeeds.

**Dependencies:** T01

**Files likely touched:**
- `docker-compose.yml` · `backend/.env.example` · `frontend/.env.example` · `package.json`

**Estimated scope:** S

---

## Task 03: `@scsrg/shared` — domain enums, API envelope, error codes

**Description:** Create the shared package that is the single source of truth for everything crossing the wire (plan decision A1). Only domain primitives in this task; Zod payload schemas arrive with the features that need them.

**Acceptance criteria:**
- [ ] `ZoneState`, `IncidentStatus`, `UserRole`, `ActuationType`, `ActuationSource`, `ActuationStatus`, `SensorType`, `SensorStatus`, `ValidationStatus`, `HazardType`, `SystemEventType`, `SystemEventSeverity` exported as const objects **and** union types.
- [ ] `ApiResponse<T>`, `ApiErrorBody`, `ErrorCode` and `PaginationMeta` match [spec.md §11](spec.md#11-api-contract) exactly.
- [ ] Package builds to ESM + `.d.ts`, exports via a `"exports"` map, and is consumable as `workspace:*`.

**Verification:**
- [ ] `pnpm --filter @scsrg/shared build` emits `dist/index.js` and `dist/index.d.ts`.
- [ ] A scratch import of `ZoneState` from `@scsrg/shared` typechecks in the frontend.

**Dependencies:** T01

**Files likely touched:**
- `packages/shared/package.json` · `packages/shared/tsconfig.json` · `packages/shared/src/domain/index.ts` · `packages/shared/src/api/index.ts` · `packages/shared/src/index.ts`

**Estimated scope:** M

---

## Task 04: Backend skeleton — Express 5, env config, Pino, error middleware, `/health`

**Description:** Prove the whole runtime stack boots on Node 24 ESM with one route and one Socket.IO namespace **before** any domain module exists (plan risk R4 — fail fast). Environment variables are Zod-parsed at boot so the process refuses to start on an invalid value.

**Acceptance criteria:**
- [ ] `config/env.ts` parses `process.env` with Zod and exits non-zero with a readable message on invalid config.
- [ ] Pino logger configured with redaction for `authorization`, `x-zone-api-key`, `password`, `passwordHash`, `apiKey`.
- [ ] `error.middleware.ts` converts thrown `AppError`s and unknown errors into the spec §11 error envelope with correct status codes; `success` responses use the `{ success, data, meta }` envelope helper.
- [ ] `GET /health` and `GET /health/ready` return the envelope and leak nothing sensitive.
- [ ] `app.ts` builds the app without listening; `server.ts` binds HTTP + a Socket.IO instance and shuts down gracefully on `SIGTERM`.

**Verification:**
- [ ] `pnpm --filter backend dev` boots on :4000; `curl localhost:4000/health` returns `{"success":true,...}`.
- [ ] Deleting `JWT_SECRET` from `.env` makes the process exit with a config error, not a stack trace.
- [ ] `pnpm --filter backend build` (tsc) emits without errors.

**Dependencies:** T01, T03

**Files likely touched:**
- `backend/package.json` · `backend/src/config/env.ts` · `backend/src/config/logger.ts` · `backend/src/middleware/error.middleware.ts` · `backend/src/app.ts` (+ `server.ts`, `shared/errors.ts`)

**Estimated scope:** M

---

> ## ▣ Checkpoint A — Foundation
> - [ ] `pnpm install && pnpm build && pnpm typecheck && pnpm lint` all clean
> - [ ] `pnpm db:up` yields a healthy Postgres reachable on 5433
> - [ ] `curl localhost:4000/health` returns the success envelope
> - [ ] Invalid env config fails fast with a readable message
> - [ ] **Review with human before proceeding**

---

# Phase 1 — Data Foundation

> Sequential and blocking. Schema gates repositories, which gate services, which gate everything.

## Task 05: Prisma schema I — User, Zone, ZoneCredential, Sensor

**Description:** Initialise Prisma and model the configuration-side entities. Zone and sensor configuration must be rich enough that adding a fourth zone requires **no code change** ([spec.md §9.1](spec.md#91-zones)).

**Acceptance criteria:**
- [ ] `User` (unique email, `passwordHash`, `role`), `Zone` (unique `code`, `assetImportance` 0–8, `state`, `currentRiskScore`, `lastSeenAt`, `isActive`), `ZoneCredential` (`apiKeyHash`, nullable `revokedAt`), `Sensor` (unique `(zoneId, type)`, `isCritical`, JSON `configuration`) match [spec.md §10](spec.md#10-data-model).
- [ ] Enums are backed by Postgres enum types and mirror `@scsrg/shared` names exactly.
- [ ] Indexes on `Zone(state)`, `Zone(lastSeenAt)`, `ZoneCredential(zoneId, revokedAt)`.

**Verification:**
- [ ] `pnpm db:migrate` applies cleanly against an empty database.
- [ ] `pnpm db:studio` shows all four tables with the expected columns.

**Dependencies:** T02, T04

**Files likely touched:**
- `backend/prisma/schema.prisma` · `backend/prisma/migrations/*/migration.sql` · `backend/package.json`

**Estimated scope:** M

---

## Task 06: Prisma schema II — readings, transitions, incidents, acknowledgments, timeline

**Description:** Model the event-side entities that carry the hazard history, with the uniqueness constraints that make duplicate protection and acknowledgment safety database-enforced rather than application-enforced.

**Acceptance criteria:**
- [ ] `SensorReading` includes `readingId`, `sequenceNumber`, `capturedAt`, `receivedAt`, all four sensor fields, `sensorHealth` JSON, `riskScore`, `calculatedState`, `contributions` JSON, `isDuplicate`, `validationStatus`; with `UNIQUE(readingId)` and `UNIQUE(zoneId, sequenceNumber)`.
- [ ] `ZoneStateTransition`, `Incident` (all fields from spec §10 incl. `maximumRiskScore`, `dominantHazards`, `priorityScore`, `priorityExplanation`), `Acknowledgment` with `UNIQUE(incidentId)`, `IncidentTimelineEvent`.
- [ ] `Incident.zoneId` and `SensorReading.zoneId` use `onDelete: Restrict`.

**Verification:**
- [ ] `pnpm db:migrate` applies cleanly.
- [ ] Inserting two readings with the same `readingId` raises a unique violation (raw SQL check).

**Dependencies:** T05

**Files likely touched:**
- `backend/prisma/schema.prisma` · `backend/prisma/migrations/*/migration.sql`

**Estimated scope:** S

---

## Task 07: Prisma schema III — actuation, overrides, audit, system events, reports + indexes

**Description:** Complete the schema with the operational and audit tables, and add every index listed in [spec.md §10](spec.md#required-indexes) — including the composite that the 24-hour incident query depends on (criterion 26).

**Acceptance criteria:**
- [ ] `ActuationCommand`, `ManualOverride`, `AuditLog`, `SystemEvent`, `IncidentReport` (bonus 3, created now so no migration is needed later) modelled per spec §10.
- [ ] All required indexes present: `Incident(status, createdAt)`, `Incident(zoneId, startedAt)`, `SensorReading(zoneId, capturedAt DESC)`, `SensorReading(readingId)`, `SensorReading(zoneId, sequenceNumber)`, `Zone(state)`, `Zone(lastSeenAt)`, `IncidentTimelineEvent(incidentId, createdAt)`, `ZoneStateTransition(zoneId, createdAt)`, `ActuationCommand(zoneId, requestedAt)`, `ActuationCommand(status)`, `SystemEvent(createdAt)`, `SystemEvent(type, severity)`.

**Verification:**
- [ ] `pnpm db:migrate` applies cleanly.
- [ ] `\d+ "Incident"` in psql lists the `(status, createdAt)` index.

**Dependencies:** T06

**Files likely touched:**
- `backend/prisma/schema.prisma` · `backend/prisma/migrations/*/migration.sql`

**Estimated scope:** M

---

## Task 08: Partial unique index — one active incident per zone

**Description:** Enforce "at most one active incident per zone" at the database level (plan decision A4, risk R2). Prisma's DSL cannot express `WHERE status IN (...)`, so this needs a hand-edited migration. This constraint *is* the no-duplicate-incident guarantee — it must never be reduced to application logic.

**Acceptance criteria:**
- [ ] A hand-written migration creates `CREATE UNIQUE INDEX incident_one_active_per_zone ON "Incident"("zoneId") WHERE status IN ('OPEN','ACKNOWLEDGED');`.
- [ ] `prisma migrate diff` reports no drift between schema and database after the migration.
- [ ] The index is documented in `schema.prisma` as a comment so it is not lost on a future regeneration.

**Verification:**
- [ ] Integration test: inserting a second `OPEN` incident for the same zone raises a unique violation; inserting one after the first is `RESOLVED` succeeds.
- [ ] Integration test: `DELETE FROM "Zone"` for a zone with incidents fails with a foreign-key error.
- [ ] `pnpm db:reset` round-trips from empty to fully migrated.

**Dependencies:** T07

**Files likely touched:**
- `backend/prisma/migrations/*/migration.sql` · `backend/prisma/schema.prisma` · `backend/src/tests/integration/schema-constraints.test.ts`

**Estimated scope:** S

---

## Task 09: Prisma client singleton, transaction helper, repository conventions

**Description:** Provide the data-access substrate every later module builds on: one Prisma client, a typed transaction helper so the ingestion pipeline can run steps 9–14 atomically (plan decision A3), and the repository conventions that keep Prisma out of services.

**Acceptance criteria:**
- [ ] `database/prisma.ts` exports one client instance with pool sizing driven by env (plan risk R7) and hot-reload safety in dev.
- [ ] `database/transaction.ts` exposes `withTransaction<T>(fn: (tx: PrismaTx) => Promise<T>)` with a configurable timeout, typed so repositories accept either the client or a transaction handle.
- [ ] Test setup (`src/tests/setup.ts`) points at `scsrg_test`, applies migrations once, and truncates all tables between tests; the integration Vitest project runs single-threaded (plan risk R5).
- [ ] Vitest configured with two projects: `unit` (node, colocated) and `integration` (`src/tests/integration`).

**Verification:**
- [ ] `pnpm --filter backend test` runs the T08 constraint tests green against `scsrg_test`.
- [ ] Running the integration suite twice in a row passes both times (no leaked state).

**Dependencies:** T08

**Files likely touched:**
- `backend/src/database/prisma.ts` · `backend/src/database/transaction.ts` · `backend/src/tests/setup.ts` · `backend/vitest.config.ts` · `backend/package.json`

**Estimated scope:** M

---

> ## ▣ Checkpoint B — Schema
> - [ ] `pnpm db:migrate` applies cleanly from an empty database
> - [ ] `pnpm db:reset` round-trips
> - [ ] Partial unique index rejects a second active incident per zone
> - [ ] Deleting a zone that has incidents fails
> - [ ] Integration suite passes twice consecutively
> - [ ] **Review with human before proceeding**

---

# Phase 2 — Authentication & RBAC

## Task 10: Shared auth schemas + JWT and password utilities

**Description:** Add the login/auth Zod schemas to `@scsrg/shared` and the backend crypto helpers. Keeping the schemas shared means the login form and the endpoint validate against the identical rules.

**Acceptance criteria:**
- [ ] `loginSchema` (email format, password min 8) and `authUserSchema` / `loginResponseSchema` exported from `@scsrg/shared`.
- [ ] `hashPassword` / `verifyPassword` use bcrypt at `BCRYPT_ROUNDS` (default 12).
- [ ] `signAccessToken` / `verifyAccessToken` use `JWT_SECRET` and `JWT_EXPIRES_IN`, embedding `sub`, `role`, `email`; malformed and expired tokens raise a typed `AppError`.

**Verification:**
- [ ] Unit tests: round-trip hash/verify; a wrong password fails; an expired token (fake clock) raises `UNAUTHENTICATED`; a token signed with a different secret is rejected.

**Dependencies:** T03, T09

**Files likely touched:**
- `packages/shared/src/schemas/auth.schema.ts` · `packages/shared/src/index.ts` · `backend/src/modules/auth/password.util.ts` · `backend/src/modules/auth/token.util.ts` · `backend/src/modules/auth/token.util.test.ts`

**Estimated scope:** M

---

## Task 11: Auth module — `POST /auth/login`, `GET /auth/me`

**Description:** First real vertical of the API: controller → service → repository, with no business logic in the controller. Establishes the module shape every later module copies.

**Acceptance criteria:**
- [ ] `POST /auth/login` returns `200` with `{ token, user }` in the envelope; unknown email and wrong password both return `401 INVALID_CREDENTIALS` with an identical message and timing-neutral handling (no user enumeration).
- [ ] `GET /auth/me` returns the current user; missing/invalid token returns `401 UNAUTHENTICATED`.
- [ ] `passwordHash` never appears in any response body or log line.

**Verification:**
- [ ] Integration test covers: valid login, wrong password, unknown email, `/auth/me` with and without a token.
- [ ] `grep -r passwordHash` shows no occurrence in any controller response mapper.

**Dependencies:** T10

**Files likely touched:**
- `backend/src/modules/auth/auth.controller.ts` · `auth.service.ts` · `auth.repository.ts` · `auth.routes.ts` · `backend/src/app.ts`

**Estimated scope:** M

---

## Task 12: Authentication + authorization middleware and the RBAC guard matrix

**Description:** Backend-enforced RBAC ([spec.md §9.13](spec.md#913-rbac)). The frontend hiding a button is never the mechanism — a direct API call from a staff token must be refused.

**Acceptance criteria:**
- [ ] `authentication.middleware.ts` attaches a typed `req.user` from the Bearer token or returns `401`.
- [ ] `authorization.middleware.ts` exposes `requireRole("ADMIN")` returning `403 FORBIDDEN`.
- [ ] `validation.middleware.ts` provides `validate({ body?, query?, params? })` returning `400 VALIDATION_ERROR` with per-field `details`.
- [ ] A single exported route-guard matrix documents which roles reach which route groups.

**Verification:**
- [ ] Unit tests for each middleware in isolation (no token, bad token, wrong role, right role).
- [ ] Integration test: a `SECURITY_STAFF` token on a temporary admin-guarded test route returns `403`.

**Dependencies:** T11

**Files likely touched:**
- `backend/src/middleware/authentication.middleware.ts` · `authorization.middleware.ts` · `validation.middleware.ts` · `backend/src/middleware/*.test.ts`

**Estimated scope:** M

---

## Task 13: Seed infrastructure + seeded users

**Description:** Build the seed harness (idempotent, ordered, logged) and seed the two development accounts. Zones and history are seeded later in T30 once their schema is exercised.

**Acceptance criteria:**
- [ ] `prisma/seed.ts` is idempotent (safe to re-run) and logs what it created.
- [ ] Seeds `admin@scsrg.local` / `Admin123!` (ADMIN) and `security@scsrg.local` / `Security123!` (SECURITY_STAFF).
- [ ] Seed output prints a clear **"development-only credentials"** warning.
- [ ] `pnpm db:seed` wired at the root.

**Verification:**
- [ ] `pnpm db:seed` twice in a row succeeds without duplicate-key errors.
- [ ] Both accounts authenticate through `POST /auth/login`.

**Dependencies:** T12

**Files likely touched:**
- `backend/prisma/seed.ts` · `backend/prisma/seeds/users.seed.ts` · `backend/package.json` · `package.json`

**Estimated scope:** S

---

## Task 14: Auth and RBAC integration tests

**Description:** Lock the auth surface with Supertest before any feature builds on it, including the login rate limit (criterion 15 groundwork).

**Acceptance criteria:**
- [ ] Tests cover login success for both roles, wrong password, unknown email, malformed body → `400`, `/auth/me` authenticated and unauthenticated.
- [ ] A test asserts the 6th login attempt within a minute returns `429 RATE_LIMITED`.
- [ ] Tests are order-independent and use the seeded users via a fixture builder.

**Verification:**
- [ ] `pnpm --filter backend test:integration` green.
- [ ] Suite passes when run in a shuffled order.

**Dependencies:** T13

**Files likely touched:**
- `backend/src/tests/integration/auth.test.ts` · `backend/src/tests/fixtures/user.fixture.ts` · `backend/src/tests/helpers/request.ts`

**Estimated scope:** S

---

> ## ▣ Checkpoint C — Auth
> - [ ] Both seeded accounts log in and receive a working JWT
> - [ ] Wrong password → `401 INVALID_CREDENTIALS`, no user enumeration
> - [ ] Staff token → `403` on an admin-guarded route
> - [ ] Login rate-limited at 5/min
> - [ ] **Review with human before proceeding**

---

# Phase 3 — Frontend Shell

> Parallelisable with Phase 4 (no shared files, no shared dependencies).

## Task 15: Frontend dependencies + shadcn components + Recharts smoke test

**Description:** Add the missing runtime dependencies and pull in the shadcn/ui components the dashboard needs. **This task front-loads plan risks R1 and R6:** the installed shadcn is v4 `base-maia` on `@base-ui/react`, not Radix, and Recharts 3 must be proven under React 19 *before* any page depends on it.

**Acceptance criteria:**
- [ ] Added: `react-router`, `@tanstack/react-query`, `socket.io-client`, `react-hook-form`, `@hookform/resolvers`, `zod`, `recharts`, `sonner`, `date-fns`, `@scsrg/shared` (workspace).
- [ ] shadcn components added via the CLI: card, badge, table, dialog, drawer/sheet, tabs, select, input, label, form, switch, slider, sonner, tooltip, dropdown-menu, separator, scroll-area, alert, skeleton, popover, command, progress, sidebar.
- [ ] A throwaway smoke route renders a Dialog, a Select and a Recharts `LineChart` **without console errors** — the R1/R6 escape hatch is exercised now, not at Checkpoint I.
- [ ] Existing `index.css` tokens, `components.json`, `theme-provider.tsx` and `button.tsx` are untouched.

**Verification:**
- [ ] `pnpm --filter frontend build` and `pnpm --filter frontend lint` pass.
- [ ] Smoke route renders all three primitives in dark and light mode.
- [ ] `git diff` shows no change to the four protected files.

**Dependencies:** T03

**Files likely touched:**
- `frontend/package.json` · `frontend/src/components/ui/*` (generated) · `frontend/src/routes/__smoke.tsx` (temporary)

**Estimated scope:** M

---

## Task 16: Query client, typed API client, auth storage, provider tree

**Description:** The frontend's data substrate: a fetch wrapper that understands the `ApiResponse<T>` envelope and throws typed errors, a configured `QueryClient`, token storage, and the provider tree — extending the existing `main.tsx` rather than replacing it.

**Acceptance criteria:**
- [ ] `lib/api.ts` unwraps `{ success, data }`, throws a typed `ApiError` carrying `code`/`status`/`details`, and attaches the Bearer token.
- [ ] A `401` response clears the stored token and redirects to `/login` exactly once (no redirect loops).
- [ ] `lib/query-client.ts` sets sane retry/stale defaults; `lib/query-keys.ts` exports a typed key factory.
- [ ] `app/providers.tsx` composes `ThemeProvider` (existing) → `QueryClientProvider` → `AuthProvider` → `Toaster`; `main.tsx` is extended, not rewritten.

**Verification:**
- [ ] Unit test: the client unwraps a success envelope and throws `ApiError` with the right `code` on an error envelope.
- [ ] Unit test: a `401` triggers exactly one token clear.

**Dependencies:** T15

**Files likely touched:**
- `frontend/src/lib/api.ts` · `query-client.ts` · `query-keys.ts` · `lib/auth-storage.ts` · `frontend/src/app/providers.tsx`

**Estimated scope:** M

---

## Task 17: Router, route table, role guards, app shell

**Description:** The command-centre chrome: sidebar navigation, top bar, and route-level role guards. Admin-only routes are guarded, not merely hidden — deep-linking to `/system-health` as staff must not render it.

**Acceptance criteria:**
- [ ] Routes for all nine destinations in [spec.md §13](spec.md#13-frontend-specification); admin-only routes wrapped in a `RequireRole("ADMIN")` guard, all authenticated routes in `RequireAuth`.
- [ ] `App.tsx` placeholder content is replaced by the router shell; the temporary smoke route from T15 is deleted.
- [ ] Sidebar hides admin items for `SECURITY_STAFF`; the top bar reserves slots for the summary metrics and the connection badge.
- [ ] Dark mode is the default for the command-centre view; the existing `d` hotkey still toggles.

**Verification:**
- [ ] Manual: log in as staff, deep-link to `/system-health`, get redirected/denied rather than a blank render.
- [ ] `pnpm --filter frontend build` passes.

**Dependencies:** T16

**Files likely touched:**
- `frontend/src/routes/index.tsx` · `frontend/src/routes/guards.tsx` · `frontend/src/components/layout/app-shell.tsx` · `sidebar-nav.tsx` · `frontend/src/App.tsx`

**Estimated scope:** M

---

## Task 18: Login page + auth flow + profile page

**Description:** Close the first user-visible loop: React Hook Form + Zod resolver against the **shared** `loginSchema`, a login mutation, session restoration on reload, and a profile page showing the current user and role.

**Acceptance criteria:**
- [ ] Login form validates client-side with the shared schema and surfaces server `401`s inline (never a blank failure).
- [ ] Successful login stores the token, primes `/auth/me`, and redirects to the Command Center.
- [ ] A page reload keeps the session; logout clears it and returns to `/login`.
- [ ] Profile page shows name, email, role badge and a logout action.

**Verification:**
- [ ] Manual: log in as both seeded users, reload, log out.
- [ ] Component test: submitting an invalid email shows a field error and fires no request.

**Dependencies:** T17

**Files likely touched:**
- `frontend/src/features/auth/login-page.tsx` · `use-auth.ts` · `auth-provider.tsx` · `frontend/src/features/profile/profile-page.tsx`

**Estimated scope:** M

---

## Task 19: Frontend auth and guard tests

**Description:** Establish the frontend testing harness — Vitest + jsdom + RTL + MSW handlers + a socket test double — and cover the auth flows. The harness matters more than the tests here: every later frontend task depends on it.

**Acceptance criteria:**
- [ ] `vitest.config.ts` (jsdom), `src/test/setup.ts`, MSW handlers for `/auth/*`, and a fake `Socket` emitter exist and are reusable.
- [ ] Tests: login success redirects; login failure shows the error; an unauthenticated visit to a guarded route redirects; admin nav items are absent for `SECURITY_STAFF`.

**Verification:**
- [ ] `pnpm --filter frontend test` green.

**Dependencies:** T18

**Files likely touched:**
- `frontend/vitest.config.ts` · `frontend/src/test/setup.ts` · `frontend/src/test/msw/handlers.ts` · `frontend/src/test/socket-double.ts` · `frontend/src/features/auth/login-page.test.tsx`

**Estimated scope:** M

---

> ## ▣ Checkpoint D — First end-to-end slice ⭐
> - [ ] A human opens `localhost:5173`, logs in as either seeded user
> - [ ] Lands on an empty Command Center inside the app shell
> - [ ] Admin nav items appear only for the admin account
> - [ ] Deep-linking to an admin route as staff is denied
> - [ ] Reload preserves the session; logout clears it
> - [ ] Dialog, Select and Recharts all render cleanly (R1/R6 retired)
> - [ ] **Review with human before proceeding**

---

# Phase 4 — Pure Engines

> No database, no clock, no I/O. Fully unit-testable in isolation (plan decision A2).

## Task 20: Risk config + `computeRisk` + classification + clamping

**Description:** The heart of the system ([spec.md §9.4](spec.md#94-risk-fusion-engine)). A pure function taking debounced inputs and injected config, returning score, state and per-signal contributions. No calculation logic may ever live in a controller.

**Acceptance criteria:**
- [ ] `config/risk.config.ts` reads weights (40/25/20/15) and thresholds (30/65), hysteresis and recovery count from env with documented defaults.
- [ ] `computeRisk(inputs, config)` is pure — no imports of Prisma, Date, or the logger — and returns `{ riskScore, state, contributions, reasons }`.
- [ ] Score is clamped to `[0, 100]` and rounded to 2 decimals; classification is `0–29.99 SAFE`, `30–64.99 WARNING`, `≥65 CRITICAL`.
- [ ] Out-of-range gas/water inputs are clamped defensively even though validation should have rejected them upstream.

**Verification:**
- [ ] Unit tests: all-zero → 0/SAFE; all-max → 100/CRITICAL; the spec's worked example (fire + gas 0.7 + occupied) → 72.5/CRITICAL with the exact contribution breakdown.

**Dependencies:** T04 (config pattern) — no database dependency

**Files likely touched:**
- `backend/src/config/risk.config.ts` · `backend/src/modules/risk-engine/risk.service.ts` · `risk.types.ts` · `risk.service.test.ts`

**Estimated scope:** M

---

## Task 21: Risk explanation generator + boundary and multi-hazard tests

**Description:** Generate the human-readable `reasons[]` so the UI never has to reconstruct *why* a zone is in its state, and prove the classification boundaries exactly (criteria 3, 5).

**Acceptance criteria:**
- [ ] `explain()` emits one reason per contributing signal, including suppression notices ("Gas suppressed during warm-up", "Occupancy sensor unavailable — not counted toward risk").
- [ ] Reason strings are deterministic for identical inputs (snapshot-testable).
- [ ] Boundary tests assert **29.99 → SAFE, 30 → WARNING, 64.99 → WARNING, 65 → CRITICAL** exactly.
- [ ] Multi-hazard combination tests: fire+gas, fire+water, gas+water+occupancy, all four.
- [ ] Proportionality tests for gas and water at 0.0 / 0.25 / 0.5 / 0.75 / 1.0.

**Verification:**
- [ ] `pnpm --filter backend test:coverage` reports ≥ 90 % lines and branches for `risk-engine`.

**Dependencies:** T20

**Files likely touched:**
- `backend/src/modules/risk-engine/explain.ts` · `explain.test.ts` · `risk.service.test.ts`

**Estimated scope:** S

---

## Task 22: Fire debounce service with asymmetric hysteresis

**Description:** Confirm fire only after N consecutive positives, and clear only after N consecutive negatives ([spec.md §9.5](spec.md#95-sensor-processing-rules)) so a momentary dropout during a real fire cannot silence the alarm. State is held in a rebuildable per-zone map (plan decision A9) with an injected clock (plan risk R8) — no `sleep()` in tests.

**Acceptance criteria:**
- [ ] `fireSignal` becomes 1 only on the `FIRE_DEBOUNCE_CONSECUTIVE`-th (default 5) consecutive `true`.
- [ ] `fireSignal` returns to 0 only after `FIRE_CLEAR_CONSECUTIVE` consecutive `false` readings.
- [ ] Per-zone counters are isolated — one zone's flicker never affects another.
- [ ] `rehydrate(zoneId, recentReadings)` reconstructs counters from stored readings for restart recovery.

**Verification:**
- [ ] Unit tests: 4 positives → signal 0; the 5th → signal 1; a `false` at reading 3 resets the counter; 4 negatives after confirmation keep the signal 1, the 5th clears it; two zones interleaved stay independent.
- [ ] Zero `sleep`/`setTimeout` calls in the test file.

**Dependencies:** T20

**Files likely touched:**
- `backend/src/config/sensor.config.ts` · `backend/src/modules/ingestion/debounce.service.ts` · `debounce.service.test.ts` · `backend/src/shared/clock.ts`

**Estimated scope:** M

---

## Task 23: Gas warm-up, water phase, occupancy debounce

**Description:** The remaining sensor rules. The critical subtlety: an unavailable occupancy sensor yields `UNAVAILABLE`, **never** `occupancy: false` (criterion 23) — it contributes 0 to risk but is treated as occupied by the priority engine so dispatch fails safe.

**Acceptance criteria:**
- [ ] Gas warm-up starts on a zone's first gas reading after boot or reconnection; during `GAS_WARMUP_MS` the gas contribution is forced to 0, status is `WARMING_UP`, and gas can raise neither state nor an incident. Suppression appears in `reasons`.
- [ ] Water phase derived as `DRY < 0.15`, `RISING 0.15–0.59`, `CRITICAL ≥ 0.6`, `RESET` below 0.1.
- [ ] Occupancy debounced over `OCCUPANCY_DEBOUNCE_READINGS` (default 3); an unavailable sensor returns `UNAVAILABLE` with `occupancyFactor = 0`, never `false`.
- [ ] All three expose `rehydrate()` for restart recovery.

**Verification:**
- [ ] Unit tests: gas 0.9 during warm-up contributes 0 and cannot reach CRITICAL; the same reading after expiry contributes 22.5; water phase transitions at each boundary; occupancy flicker is debounced; an unavailable occupancy sensor never yields `false`.

**Dependencies:** T22

**Files likely touched:**
- `backend/src/modules/ingestion/warmup.service.ts` · `occupancy.service.ts` · `water.service.ts` · corresponding `*.test.ts` files

**Estimated scope:** M

---

> ## ▣ Checkpoint E — Engines
> - [ ] ≥ 90 % coverage on `risk-engine`
> - [ ] Boundaries asserted exactly at 29.99 / 30 / 64.99 / 65
> - [ ] A 4-reading flicker contributes 0; the 5th confirms
> - [ ] Gas is fully suppressed during warm-up
> - [ ] An unavailable occupancy sensor is never reported as `false`
> - [ ] No `sleep()` anywhere in the unit suite
> - [ ] **Review with human before proceeding**

---

# Phase 5 — Zones & Ingestion

## Task 24: Zone repository, service, `GET /zones` and `GET /zones/:zoneId`

**Description:** The read side of zones. `GET /zones` must return **every** zone's current status in one request (criterion 1) — the Command Center's grid depends on it being a single round trip.

**Acceptance criteria:**
- [ ] `GET /zones` returns all active zones with state, current risk score, contributions, sensor health, last-seen, actuator state and active-incident summary — in one query set, no N+1.
- [ ] `GET /zones/:zoneId` returns detail incl. configuration and asset importance; unknown id → `404 NOT_FOUND`.
- [ ] Response DTOs are defined in `@scsrg/shared` so the frontend types come from the same source.
- [ ] Services never import the Prisma client directly — all access via `zones.repository.ts`.

**Verification:**
- [ ] Integration tests: list returns all seeded zones; detail 200/404.
- [ ] Query log shows a bounded number of queries for the list (no per-zone loop).

**Dependencies:** T13, T09

**Files likely touched:**
- `backend/src/modules/zones/zones.controller.ts` · `zones.service.ts` · `zones.repository.ts` · `zones.routes.ts` · `packages/shared/src/api/zone.dto.ts`

**Estimated scope:** M

---

## Task 25: Zone API-key middleware

**Description:** Sensor-node authentication via `X-Zone-API-Key` ([spec.md §9.13](spec.md#913-rbac)). Keys are bcrypt-hashed at rest; a zone key grants access to `/ingestion/*` **for that zone only** and nothing else.

**Acceptance criteria:**
- [ ] `zone-auth.middleware.ts` resolves the zone from the route param, compares the header against non-revoked `ZoneCredential` hashes, and attaches a typed `req.zone`.
- [ ] Missing/invalid/revoked key → `401 INVALID_ZONE_KEY`; a key belonging to a different zone → `403 FORBIDDEN`; inactive zone → `403 ZONE_INACTIVE`.
- [ ] A zone key can never satisfy a JWT-guarded route, and a JWT can never satisfy an ingestion route.
- [ ] The key value is never logged (redaction verified).

**Verification:**
- [ ] Integration tests for all five outcomes above.
- [ ] Log output for a rejected request contains `[Redacted]` in place of the key.

**Dependencies:** T24

**Files likely touched:**
- `backend/src/middleware/zone-auth.middleware.ts` · `backend/src/modules/zones/zone-credential.repository.ts` · `zone-auth.middleware.test.ts`

**Estimated scope:** M

---

## Task 26: Ingestion validation — schema, range, timestamp, configured sensors

**Description:** Reject bad data before any risk is computed (criterion 19). The distinction the spec insists on: wrong *shape* is `400`, valid shape with *impossible values* is `422`.

**Acceptance criteria:**
- [ ] The shared `sensorReadingSchema` accepts `readingId`, `sequenceNumber`, `capturedAt`, `sensors{fireDetected, gasLevel, waterLevel, occupancyDetected}` and **strips/rejects** any client-supplied `riskScore`, `state`, `priority` or `incidentStatus` (criterion 2).
- [ ] `400 VALIDATION_ERROR` for malformed shape, with per-field `details`.
- [ ] `422` for: gas or water `< 0` or `> 1` (`VALUE_OUT_OF_RANGE`), timestamp unparseable or more than `MAX_FUTURE_TIMESTAMP_SKEW_MS` in the future (`INVALID_TIMESTAMP`), a sensor value supplied for a type not configured on the zone (`SENSOR_NOT_CONFIGURED`).
- [ ] Every rejection writes a `SystemEvent` of type `VALIDATION_FAILURE` for the System Health page.

**Verification:**
- [ ] Unit tests for each rejection branch.
- [ ] Integration tests: `{"gasLevel": -0.1}` → 422; `{"gasLevel": 1.5}` → 422; `{"gasLevel": "high"}` → 400; a payload containing `riskScore` is rejected or stripped and never persisted.

**Dependencies:** T25, T23

**Files likely touched:**
- `packages/shared/src/schemas/sensor-reading.schema.ts` · `backend/src/modules/ingestion/validation.service.ts` · `validation.service.test.ts` · `backend/src/modules/system-health/system-event.repository.ts`

**Estimated scope:** M

---

## Task 27: Duplicate and out-of-order detection

**Description:** Duplicates must never be counted twice (criterion 18) and stale readings must never corrupt live state (criterion 20). Duplicate rejection rides on the database unique constraints, not an application lookup — so it stays correct under concurrency.

**Acceptance criteria:**
- [ ] A repeat `readingId`, or a repeat `(zoneId, sequenceNumber)`, returns `409 DUPLICATE_READING`, creates **no** second row, and writes a `SystemEvent`.
- [ ] A reading whose `capturedAt` precedes — or whose `sequenceNumber` is below — the latest accepted reading is **stored** with `validationStatus = ACCEPTED_OUT_OF_ORDER`, and is barred from updating live state, creating a transition, opening an incident, or issuing actuation.
- [ ] `isDuplicate` is set `true` on an accepted reading whose sensor payload is byte-identical to the previous accepted reading for that zone ([spec.md §10](spec.md#10-data-model)).

**Verification:**
- [ ] Integration tests: duplicate `readingId` → 409 with `count(*) == 1`; duplicate sequence number → 409; an out-of-order reading is persisted while `Zone.state` and `Zone.currentRiskScore` are unchanged and no `ZoneStateTransition` row appears.

**Dependencies:** T26

**Files likely touched:**
- `backend/src/modules/ingestion/duplicate.service.ts` · `ordering.service.ts` · `*.test.ts` · `backend/src/modules/ingestion/reading.repository.ts`

**Estimated scope:** M

---

## Task 28: Ingestion orchestrator — the atomic pipeline

**Description:** Wire steps 1–16 of [spec.md §9.2](spec.md#92-ingestion-pipeline-authoritative-order) into `POST /ingestion/zones/:zoneId/readings`, with steps 9–14 inside **one transaction** (plan decision A3). Incident and actuation hooks are stubbed here and filled in by Phase 6; the transaction boundary is established now so those tasks slot in without restructuring.

**Acceptance criteria:**
- [ ] The endpoint executes auth → schema → semantic → duplicate → ordering → normalise → debounce → risk → persist → live-state → transition in the documented order.
- [ ] Persist, live-state update and transition creation are atomic — an induced failure mid-transaction leaves no reading row and no state change.
- [ ] A `ZoneStateTransition` row is written **only** when the state actually changes, recording previous state, new state, risk score and reason.
- [ ] `201` on acceptance, returning the computed `{ riskScore, state, contributions, reasons }` so the simulator can display the backend's own verdict.
- [ ] The controller contains no business logic.

**Verification:**
- [ ] Integration test: a raw reading with fire+gas produces the exact score, state, contributions and reasons in the database (criterion 3).
- [ ] Integration test: forced failure inside the transaction rolls everything back.
- [ ] Integration test: two consecutive identical-state readings create exactly one transition row.

**Dependencies:** T27

**Files likely touched:**
- `backend/src/modules/ingestion/ingestion.controller.ts` · `ingestion.service.ts` · `ingestion.routes.ts` · `backend/src/modules/zones/zone-state.service.ts` · `backend/src/tests/integration/ingestion.test.ts`

**Estimated scope:** M

---

## Task 29: Heartbeat endpoint + offline monitor job

**Description:** Offline detection ([spec.md §9.10](spec.md#910-offline-detection--reconnection)). The rule that matters: OFFLINE is never SAFE and never silently closes an incident (criterion 23).

**Acceptance criteria:**
- [ ] `POST /ingestion/zones/:zoneId/heartbeat` updates `lastSeenAt` without creating a reading.
- [ ] `jobs/heartbeat-monitor.ts` sweeps every `ZONE_OFFLINE_SWEEP_MS` and marks zones silent beyond `ZONE_OFFLINE_TIMEOUT_MS` as `OFFLINE`, writing a transition and a `SystemEvent`.
- [ ] Going OFFLINE never resolves or closes an active incident.
- [ ] On reconnection the zone recomputes state from its first accepted reading — never assumed SAFE — and gas warm-up restarts.
- [ ] A zone whose `isCritical` (flame) sensor reports unavailable is marked OFFLINE even while other sensors report.

**Verification:**
- [ ] Integration test with the timeout configured to 300 ms: a silent zone flips to OFFLINE, an active incident stays open, and a subsequent valid reading restores the correct computed state.

**Dependencies:** T28

**Files likely touched:**
- `backend/src/jobs/heartbeat-monitor.ts` · `backend/src/modules/ingestion/heartbeat.controller.ts` · `backend/src/modules/zones/zone-state.service.ts` · `backend/src/tests/integration/offline.test.ts`

**Estimated scope:** M

---

## Task 30: Seed zones, sensors, credentials and the dev key file

**Description:** Seed the three campus zones with their sensor configuration, asset importance and API credentials. Generated keys are printed once and written to gitignored files — never exposed as hashes-pretending-to-be-credentials.

**Acceptance criteria:**
- [ ] Seeds IoT Lab (flame/gas/occupancy, importance 5), Server Room (flame/water/occupancy, importance 8), Robotics Lab (flame/gas/occupancy, importance 6) per [spec.md §9.1](spec.md#91-zones).
- [ ] Flame sensors are marked `isCritical: true`.
- [ ] A plaintext API key is generated per zone, bcrypt-hashed into `ZoneCredential`, printed once, and written to `backend/.dev-zone-keys.json` and `backend/.env.simulator` (both gitignored).
- [ ] Seed is idempotent and re-runnable.

**Verification:**
- [ ] `pnpm db:seed` then POST a reading with a printed key → `201`; with a wrong key → `401`.
- [ ] `git status` shows neither generated file as untracked-but-addable.

**Dependencies:** T29

**Files likely touched:**
- `backend/prisma/seeds/zones.seed.ts` · `backend/prisma/seed.ts` · `backend/scripts/print-zone-keys.ts` · `.gitignore`

**Estimated scope:** M

---

> ## ▣ Checkpoint F — Hazard processing ⭐
> - [ ] A raw reading with a valid zone key persists with **backend-computed** score, state, contributions and reasons
> - [ ] Malformed → 400 · impossible → 422 · duplicate → 409 (one row only)
> - [ ] An out-of-order reading is stored but does not move live state
> - [ ] A silent zone flips to OFFLINE and is never rendered SAFE
> - [ ] A client-supplied `riskScore` is never trusted or persisted
> - [ ] **Review with human before proceeding**

---

# Phase 6 — Incidents, Actuation & Priority

## Task 31: Incident lifecycle — open on CRITICAL, resolve on confirmed recovery

**Description:** [spec.md §9.7](spec.md#97-incident-lifecycle). Two rules carry the weight: oscillation must not spawn duplicates (guaranteed by the T08 partial unique index), and a resolved incident followed by a fresh CRITICAL must create a **new** incident.

**Acceptance criteria:**
- [ ] Entering CRITICAL opens exactly one incident; the partial unique index is the enforcement, with the violation caught and handled rather than surfaced as a 500.
- [ ] Leaving CRITICAL requires score `< 65 − STATE_HYSTERESIS` for `RECOVERY_CONSECUTIVE_READINGS` consecutive readings before resolution.
- [ ] `RESOLVED` → new CRITICAL creates a second, distinct incident.
- [ ] `maximumRiskScore` is a monotonic high-water mark; `currentRiskScore` tracks live.
- [ ] A zone entering OFFLINE leaves its incident open.

**Verification:**
- [ ] Integration test: a score oscillating 63→66→63→66 across 20 readings yields exactly **one** incident row.
- [ ] Integration test: critical → resolved → critical yields **two** rows with distinct ids.
- [ ] Integration test: recovery below threshold for 2 readings does *not* resolve; the 3rd does.

**Dependencies:** T28

**Files likely touched:**
- `backend/src/modules/incidents/incident.service.ts` · `incident.repository.ts` · `incident-lifecycle.service.ts` · `backend/src/tests/integration/incident-lifecycle.test.ts`

**Estimated scope:** M

---

## Task 32: Incident timeline, dominant hazards, risk high-water mark

**Description:** Every incident carries a complete, ordered narrative (criterion 17) so the history page can reconstruct exactly what happened.

**Acceptance criteria:**
- [ ] Timeline events written for `CREATED`, `RISK_UPDATED`, `STATE_CHANGED`, `ACKNOWLEDGED`, `ACTUATION_ISSUED`, `OVERRIDE_APPLIED`, `ZONE_OFFLINE`, `RESOLVED`, each with a message and structured `metadata`.
- [ ] `dominantHazards[]` derived from the largest risk contributions and updated as the incident evolves.
- [ ] Timeline writes happen inside the ingestion transaction so an incident can never exist without its `CREATED` event.
- [ ] Out-of-order readings never insert timeline events.

**Verification:**
- [ ] Integration test: a full critical→acknowledge→resolve cycle produces the complete ordered chain with no gaps and no duplicates.

**Dependencies:** T31

**Files likely touched:**
- `backend/src/modules/incidents/timeline.service.ts` · `timeline.repository.ts` · `hazard.util.ts` · `timeline.service.test.ts`

**Estimated scope:** M

---

## Task 33: Concurrency-safe acknowledgment

**Description:** [spec.md §9.8](spec.md#98-acknowledgment-concurrency) — exactly one acknowledgment wins (criterion 14). Two database-level mechanisms, belt and braces (plan decision A5). Frontend button disabling is explicitly **not** the mechanism.

**Acceptance criteria:**
- [ ] Inside a transaction: conditional `UPDATE "Incident" SET status='ACKNOWLEDGED' ... WHERE id=$1 AND status='OPEN'`; 0 rows affected → `409 ALREADY_ACKNOWLEDGED`.
- [ ] `Acknowledgment` insert relies on `UNIQUE(incidentId)` as the second guard.
- [ ] The winner's `userId`, `acknowledgedAt` and optional `note` are preserved; one `AuditLog` row and one timeline event are written.
- [ ] Acknowledging a `RESOLVED` or nonexistent incident → `409` / `404` respectively.

**Verification:**
- [ ] **10 concurrent requests via `Promise.all` yield exactly 1× `200` and 9× `409`, with exactly one `Acknowledgment` row** — the named acceptance test.
- [ ] Test asserts the persisted winner matches the user whose request returned 200.

**Dependencies:** T32

**Files likely touched:**
- `backend/src/modules/acknowledgments/acknowledgment.service.ts` · `acknowledgment.repository.ts` · `backend/src/tests/integration/acknowledgment-race.test.ts`

**Estimated scope:** M

---

## Task 34: Actuation resolver + idempotent command dispatch

**Description:** [spec.md §9.12](spec.md#912-actuation-model). Desired actuator state is a pure function of zone state; commands are emitted **only on change**, so a zone sitting in CRITICAL emits one buzzer command, not one per reading (criterion 8).

**Acceptance criteria:**
- [ ] `resolveDesiredActuation(state)` is pure and returns LED colour, buzzer and relay per the spec table.
- [ ] The dispatcher diffs desired against last-known per-zone actuator state and creates `ActuationCommand` rows only on a delta; last-known state is rebuildable from the database (plan decision A9).
- [ ] Commands record `source` (`SENSOR_TRIGGERED` / `MANUAL_OVERRIDE` / `SYSTEM_RECOVERY`), `status`, `requestedAt`, `executedAt` and originating `incidentId`.
- [ ] Zones actuate independently — two simultaneous critical zones produce disjoint command sets.
- [ ] `GET /ingestion/zones/:zoneId/commands` and `POST .../commands/:commandId/complete` let a node pull and confirm.

**Verification:**
- [ ] Integration test: 50 consecutive CRITICAL readings produce exactly one `ACTIVATE_BUZZER` and one `ACTIVATE_RELAY`.
- [ ] Integration test: two zones critical simultaneously produce commands scoped to each zone with no cross-talk.
- [ ] Integration test asserts `requestedAt − receivedAt < 1000 ms` (spec §16 NFR).

**Dependencies:** T31

**Files likely touched:**
- `backend/src/modules/actuation/actuation.service.ts` · `actuation.resolver.ts` · `actuation.repository.ts` · `actuation.controller.ts` · `backend/src/tests/integration/actuation.test.ts`

**Estimated scope:** M

---

## Task 35: Priority engine (pure) with determinism and tie-breaking

**Description:** [spec.md §9.6](spec.md#96-priority-ranking-engine) — answers "who do we send security to first?", distinct from "how dangerous is this zone?" (criterion 10). Pure function, injected clock and config.

**Acceptance criteria:**
- [ ] `computePriority(incident, zone, now, config)` returns `{ priorityScore, breakdown, reasons }` using risk + occupancy(10) + duration(≤10) + asset(0–8) + multiHazard(5) − acknowledged(15).
- [ ] Unknown occupancy is treated as **occupied** for priority (fail-safe dispatch) while contributing 0 to risk.
- [ ] Ranking sorts `priorityScore DESC → riskScore DESC → startedAt ASC → incidentId ASC` — a total order.
- [ ] `reasons[]` explains each contributing term in plain English.

**Verification:**
- [ ] Unit test: 100 shuffled permutations of the same incident set produce byte-identical rankings (criterion 10).
- [ ] Unit test: incidents identical on every term rank by `startedAt` then `id`.
- [ ] Unit test: an acknowledged incident ranks below an unacknowledged one of equal risk.
- [ ] Coverage ≥ 90 % on `priority-engine`.

**Dependencies:** T33

**Files likely touched:**
- `backend/src/config/priority.config.ts` · `backend/src/modules/priority-engine/priority.service.ts` · `priority.explain.ts` · `priority.service.test.ts`

**Estimated scope:** M

---

## Task 36: Incidents API — list with filters, detail, timeline, acknowledge

**Description:** The read/write surface over incidents, including every filter the history page needs (criterion 16).

**Acceptance criteria:**
- [ ] `GET /incidents` supports `from`, `to`, `zoneId`, `status`, `hazardType`, `acknowledgedBy` and pagination, returning `meta` with total/page/pageSize.
- [ ] `GET /incidents/:incidentId` → `404 NOT_FOUND` for an unknown id; `GET /incidents/:incidentId/timeline` returns ordered events.
- [ ] `POST /incidents/:incidentId/acknowledge` wires T33 and accepts an optional `note`.
- [ ] Filter combinations are validated by a shared Zod query schema; invalid date ranges → `400`.

**Verification:**
- [ ] Integration tests for each filter individually and two in combination.
- [ ] Integration test: date-range filtering returns only incidents inside the window (criterion 16).
- [ ] Integration test: unknown id → 404; duplicate acknowledge → 409.

**Dependencies:** T35

**Files likely touched:**
- `backend/src/modules/incidents/incidents.controller.ts` · `incidents.routes.ts` · `incident.repository.ts` · `packages/shared/src/schemas/incident-filter.schema.ts` · `backend/src/tests/integration/incidents.test.ts`

**Estimated scope:** M

---

## Task 37: Priority queue API

**Description:** `GET /priority-queue` returns the ranked active incidents **with their explanations**, so the dashboard can show why rank 1 outranks rank 2 (criterion 11) without recomputing anything client-side.

**Acceptance criteria:**
- [ ] Returns rank, incident, zone, risk score, priority score, occupancy, critical duration, main hazard, acknowledgment status and `reasons[]` + `breakdown`.
- [ ] Recalculated whenever an incident opens, is acknowledged, resolves, or has its risk updated — and on boot.
- [ ] `priorityScore` and `priorityExplanation` are persisted on `Incident` so history shows the ranking as it stood.
- [ ] An empty queue returns `[]`, never `null`.

**Verification:**
- [ ] Integration test: three simultaneous critical zones return in the expected deterministic order with populated explanations.
- [ ] Integration test: acknowledging the rank-1 incident demotes it and re-ranks the rest.

**Dependencies:** T36

**Files likely touched:**
- `backend/src/modules/priority-engine/priority.controller.ts` · `priority.routes.ts` · `priority-queue.service.ts` · `backend/src/tests/integration/priority-queue.test.ts`

**Estimated scope:** M

---

## Task 38: Bootstrap restart recovery

**Description:** [spec.md §9.11](spec.md#911-backend-restart-recovery) — the backend must never assume zones are SAFE after a restart (criterion 22). All eight steps run before the HTTP listener binds.

**Acceptance criteria:**
- [ ] `bootstrap/` executes: connect → load active zones → load latest accepted readings (+ the window needed for debounce) → load OPEN/ACKNOWLEDGED incidents → reconstruct zone states → recalculate the priority queue → start heartbeat monitoring → bind HTTP/Socket.
- [ ] Debounce, warm-up, occupancy and actuator last-known state are all rehydrated via their `rehydrate()` methods.
- [ ] `OFFLINE` is re-derived from `lastSeenAt` versus wall clock at boot — a zone that went silent while the backend was down comes up OFFLINE, not SAFE.
- [ ] A database connection failure exits non-zero with a clear message rather than serving degraded.

**Verification:**
- [ ] **Integration test: seed a mid-incident database, boot the app, assert zone states, open incidents and priority-queue ordering match pre-restart values exactly.**
- [ ] Manual: kill the backend during scenario 5, restart, confirm the queue and banner return unchanged.

**Dependencies:** T37, T34, T29

**Files likely touched:**
- `backend/src/bootstrap/bootstrap.service.ts` · `state-reconstruction.service.ts` · `backend/src/server.ts` · `backend/src/tests/integration/restart-recovery.test.ts`

**Estimated scope:** M

---

> ## ▣ Checkpoint G — Core backend complete
> - [ ] Threshold oscillation creates exactly one incident; resolve-then-retrigger creates a second
> - [ ] 10 concurrent acknowledgments → 1×200, 9×409, exactly one row
> - [ ] 50 CRITICAL readings → one buzzer command, not fifty
> - [ ] Shuffled inputs always produce identical rankings
> - [ ] Restart mid-incident restores state and queue exactly
> - [ ] Coverage gates met on `risk-engine`, `priority-engine`, `ingestion`, `incidents`
> - [ ] **Review with human before proceeding**

---

# Phase 7 — Real-Time Transport

## Task 39: Socket.IO server — auth, rooms, typed emitter, event stamping

**Description:** [spec.md §12](spec.md#12-real-time-contract). Every payload carries `eventId` + `emittedAt`, which is what makes reconnect de-duplication a transport property rather than a per-toast patch (plan decision A6).

**Acceptance criteria:**
- [ ] JWT handshake auth (`auth.token`); unauthenticated connections are refused with `UNAUTHENTICATED`.
- [ ] Rooms: `dashboard` (all authenticated), `zone:<zoneId>` (detail views), `admin` (admin-only payloads).
- [ ] A typed emitter enforces the `ServerToClientEvents` map from `@scsrg/shared` at compile time.
- [ ] Every emitted payload is stamped with a unique `eventId` and an `emittedAt` ISO timestamp.
- [ ] Connection count is tracked and exposed for the System Health page.

**Verification:**
- [ ] Integration test: a handshake without a token is rejected; with a valid token it joins `dashboard`.
- [ ] Integration test: a staff token does not receive `admin`-room payloads.
- [ ] Type test: emitting an event with a wrong payload shape fails `tsc`.

**Dependencies:** T38

**Files likely touched:**
- `backend/src/realtime/socket-server.ts` · `socket-auth.ts` · `emitter.ts` · `packages/shared/src/realtime/events.ts` · `backend/src/tests/integration/socket-auth.test.ts`

**Estimated scope:** M

---

## Task 40: Wire domain events into the pipeline

**Description:** Emit the full event vocabulary from the places that already own the state changes. Broadcasts happen **after commit** so a rolled-back transaction never announces itself (plan risk R7 also benefits: no network work inside the transaction).

**Acceptance criteria:**
- [ ] Emitted: `zone:updated`, `zone:state-changed`, `incident:created`, `incident:updated`, `incident:acknowledged`, `incident:resolved`, `priority:updated`, `sensor:offline`, `system:health`, `actuation:command`.
- [ ] Emission occurs after the ingestion transaction commits, never inside it.
- [ ] `priority:updated` fires whenever the queue is recalculated.
- [ ] No event carries a password hash, API key or raw token.

**Verification:**
- [ ] Integration test with a connected socket client: driving a zone to CRITICAL yields the ordered event sequence `zone:updated → zone:state-changed → incident:created → actuation:command → priority:updated`.
- [ ] Integration test: a rolled-back transaction emits nothing.

**Dependencies:** T39

**Files likely touched:**
- `backend/src/modules/ingestion/ingestion.service.ts` · `backend/src/modules/incidents/incident.service.ts` · `backend/src/modules/priority-engine/priority-queue.service.ts` · `backend/src/realtime/domain-events.ts` · `backend/src/tests/integration/realtime-events.test.ts`

**Estimated scope:** M

---

## Task 41: `GET /dashboard/summary`

**Description:** One request that populates the whole top summary bar — total zones, per-state counts, active and unacknowledged incidents, the highest-priority incident, and a system-health rollup.

**Acceptance criteria:**
- [ ] Returns every field listed in [spec.md §11](spec.md#11-api-contract) for `/dashboard/summary`.
- [ ] Computed with aggregate queries, not by loading every zone and counting in JavaScript.
- [ ] Accessible to both roles; the health rollup omits admin-only detail for staff.

**Verification:**
- [ ] Integration test asserts counts against a seeded fixture with a known mix of states.
- [ ] Query count for the endpoint is bounded and logged in the test.

**Dependencies:** T40

**Files likely touched:**
- `backend/src/modules/dashboard/dashboard.controller.ts` · `dashboard.service.ts` · `dashboard.repository.ts` · `packages/shared/src/api/dashboard.dto.ts`

**Estimated scope:** S

---

## Task 42: Frontend socket client, reconnect snapshot, LRU de-duplication

**Description:** The client half of plan decision A6. Sockets **invalidate or patch** the TanStack Query cache; they are never a parallel store the UI reads instead (criterion 12, 21).

**Acceptance criteria:**
- [ ] `lib/socket.ts` connects with the stored JWT, reconnects with exponential backoff, and exposes typed `on`/`off` via `use-socket-event`.
- [ ] On connect **and every reconnect**, the four snapshot queries refetch: `/dashboard/summary`, `/zones`, `/incidents?status=active`, `/priority-queue`.
- [ ] A bounded LRU of the last 200 `eventId`s drops repeats; events whose `emittedAt` predates the current connection are applied to the cache but raise **no notification**.
- [ ] The connection badge shows `LIVE` / `RECONNECTING` / `OFFLINE` with icon **and** text.

**Verification:**
- [ ] Component test with the socket double: the same `eventId` delivered twice produces one cache update and one notification.
- [ ] Component test: a simulated reconnect triggers exactly four refetches and zero toasts for backdated events.

**Dependencies:** T41, T19

**Files likely touched:**
- `frontend/src/lib/socket.ts` · `frontend/src/hooks/use-socket.ts` · `use-socket-event.ts` · `frontend/src/stores/event-dedupe.ts` · `frontend/src/components/layout/connection-badge.tsx`

**Estimated scope:** M

---

> ## ▣ Checkpoint H — Live wire
> - [ ] Unauthenticated socket handshakes are refused
> - [ ] Every event carries `eventId` + `emittedAt`
> - [ ] A rolled-back transaction emits nothing
> - [ ] Reconnect refetches all four snapshots and replays zero duplicate notifications
> - [ ] **Review with human before proceeding**

---

# Phase 8 — Command Center UI

## Task 43: State badge, zone card, sensor readout, actuator strip

**Description:** The atoms of the command centre. Non-negotiable: state is conveyed by **icon + text + border**, never colour alone ([spec.md §13](spec.md#13-frontend-specification), spec §16 accessibility NFR).

**Acceptance criteria:**
- [ ] `StateBadge` covers all four states with `satisfies Record<ZoneState, …>` so a new state breaks the build.
- [ ] `ZoneCard` shows name, state label + icon, risk score, fire signal, gas level, water level, occupancy, last update, active incident, simulated LED/buzzer/relay, and a one-line reason.
- [ ] An OFFLINE card is visually and textually distinct from SAFE **and** from WARNING, and shows `lastSeenAt`.
- [ ] An unavailable sensor renders as "Unavailable", never as `false` / "Clear" (criterion 23).

**Verification:**
- [ ] Component tests render all four states and assert the icon and text label are present, not just a class name.
- [ ] Component test: an unavailable occupancy sensor never renders "Unoccupied".
- [ ] Manual: greyscale screenshot still communicates every state.

**Dependencies:** T42

**Files likely touched:**
- `frontend/src/components/zones/state-badge.tsx` · `zone-card.tsx` · `sensor-readout.tsx` · `actuator-strip.tsx` · `state-badge.test.tsx`

**Estimated scope:** M

---

## Task 44: Live zone grid + top summary bar

**Description:** The Command Center's spine — a responsive grid fed by `/zones` and kept live by `zone:updated`, above a summary bar fed by `/dashboard/summary`.

**Acceptance criteria:**
- [ ] Grid renders one card per zone, sorted with CRITICAL first then WARNING then OFFLINE then SAFE.
- [ ] Summary bar shows current time, connected zones, active incidents, unacknowledged alerts, offline zones and the WebSocket state.
- [ ] Socket events patch the query cache; no polling interval is used as the primary update mechanism.
- [ ] Loading and error states are explicit — never a silent blank grid.

**Verification:**
- [ ] Component test: a `zone:updated` event through the socket double re-renders the affected card without a refetch loop (criterion 12).
- [ ] Manual: drive a zone with `curl` and watch the card update without refreshing.

**Dependencies:** T43

**Files likely touched:**
- `frontend/src/features/dashboard/command-center-page.tsx` · `zone-grid.tsx` · `frontend/src/components/layout/summary-bar.tsx` · `frontend/src/features/dashboard/use-zones.ts`

**Estimated scope:** M

---

## Task 45: Priority queue panel + ranking explanation

**Description:** Criterion 11 — the dashboard must **visibly explain** why rank 1 outranks rank 2, without the operator opening a detail view.

**Acceptance criteria:**
- [ ] Each row shows rank, zone, risk score, priority score, occupancy, critical duration, main hazard and acknowledgment status.
- [ ] The score breakdown renders as labelled chips (`risk 84`, `occupied +10`, `multi-hazard +5`, `asset +5`, `duration +2`) plus the `reasons[]` lines.
- [ ] Ordering always mirrors the API's `rank` — the client never re-sorts.
- [ ] Live-updates on `priority:updated`; critical duration ticks locally between events.

**Verification:**
- [ ] Component test: given a two-incident fixture, the rendered order matches API rank and the explanation text for rank 1 is present in the DOM.
- [ ] Manual: run scenario 5 and read the ranking rationale off the screen.

**Dependencies:** T44

**Files likely touched:**
- `frontend/src/components/priority/priority-queue.tsx` · `rank-row.tsx` · `ranking-explanation.tsx` · `frontend/src/features/priority-queue/use-priority-queue.ts`

**Estimated scope:** M

---

## Task 46: Critical alert banner + stacked toasts + alert de-duplication

**Description:** [spec.md §13 Alert UX](spec.md#alert-ux). Multiple simultaneous alerts must remain independently visible (criterion 13) and a reconnect must never re-alarm the room (criterion 21).

**Acceptance criteria:**
- [ ] The banner appears whenever ≥ 1 unacknowledged critical incident exists, showing the highest-priority zone, risk score, leading hazard and an Acknowledge action.
- [ ] A stacked sonner toast fires per new critical incident; simultaneous alerts stack and none is overwritten or lost.
- [ ] Optional alert sound, default off, user-toggleable.
- [ ] Acknowledgment stops the repeating attention cue while keeping the incident visible until resolved.
- [ ] Alerts route through the T42 de-duplication layer — reconnects raise no repeat toasts.

**Verification:**
- [ ] Component test: two `incident:created` events produce two independently dismissible toasts (criterion 13).
- [ ] Component test: replaying the same event after a simulated reconnect produces no second toast.
- [ ] Manual: banner is legible in greyscale (icon + text + border weight).

**Dependencies:** T45

**Files likely touched:**
- `frontend/src/components/alerts/critical-banner.tsx` · `alert-toaster.tsx` · `frontend/src/hooks/use-alert-stream.ts` · `frontend/src/components/alerts/alert-toaster.test.tsx`

**Estimated scope:** M

---

## Task 47: Active incident panel + acknowledge mutation + operator note

**Description:** The operator's working surface: incident detail, hazard breakdown, timeline, acknowledge with a note, and admin override controls when authorised.

**Acceptance criteria:**
- [ ] Panel shows incident details, zone status, full hazard breakdown, timeline and resolution state.
- [ ] Acknowledge submits an optional note, shows optimistic pending state, and **handles a `409` gracefully** — "already acknowledged by X", not an error toast (criterion 14 UX half).
- [ ] Admin override controls render only for `ADMIN`; the backend remains the enforcement.
- [ ] Query invalidation refreshes the queue and summary after acknowledgment.

**Verification:**
- [ ] Component test: acknowledge fires the mutation and reflects the result.
- [ ] Component test: a mocked `409` renders the already-acknowledged state rather than a failure.
- [ ] Component test: override controls are absent for `SECURITY_STAFF` (criterion 15 UI half).

**Dependencies:** T46

**Files likely touched:**
- `frontend/src/components/incidents/active-incident-panel.tsx` · `acknowledge-button.tsx` · `frontend/src/features/incidents/use-acknowledge.ts` · `active-incident-panel.test.tsx`

**Estimated scope:** M

---

## Task 48: Live event feed

**Description:** The scrolling narrative that makes the system legible during a demo — reading accepted, WARNING entered, CRITICAL entered, incident created/acknowledged/resolved, zone offline, relay activated.

**Acceptance criteria:**
- [ ] Renders all event types from [spec.md §13](spec.md#13-frontend-specification) with timestamp, zone and a severity icon.
- [ ] Bounded to the most recent N entries (default 100) so a long demo cannot grow unbounded.
- [ ] Backfilled from the API on mount, then appended from sockets — de-duplicated by `eventId`.
- [ ] Pausable, so an operator can read an entry without it scrolling away.

**Verification:**
- [ ] Component test: 150 events leave exactly 100 rendered, newest first.
- [ ] Component test: a duplicate `eventId` does not append a second row.

**Dependencies:** T47

**Files likely touched:**
- `frontend/src/components/alerts/live-event-feed.tsx` · `event-row.tsx` · `frontend/src/hooks/use-event-feed.ts` · `live-event-feed.test.tsx`

**Estimated scope:** M

---

## Task 49: Command Center frontend test sweep

**Description:** Close out the eight named frontend flows from [spec.md §7](spec.md#required-frontend-tests) as one deliberate pass, filling whatever T43–T48 left uncovered.

**Acceptance criteria:**
- [ ] All eight flows covered: zone status rendering · priority ordering · ranking explanation · acknowledgment interaction · role-restricted controls · socket event updates · offline status · multiple stacked alerts.
- [ ] Tests use MSW and the socket double — no real network, no real timers.

**Verification:**
- [ ] `pnpm --filter frontend test` green; all eight flows present by name in the output.

**Dependencies:** T48

**Files likely touched:**
- `frontend/src/features/dashboard/command-center.test.tsx` · `frontend/src/components/priority/priority-queue.test.tsx` · `frontend/src/components/zones/zone-card.test.tsx` · `frontend/src/test/msw/handlers.ts`

**Estimated scope:** M

---

> ## ▣ Checkpoint I — Live demo of the core loop ⭐
> - [ ] Drive a zone to CRITICAL: banner, toast, queue entry and actuator strip all appear with no refresh
> - [ ] Acknowledge from the UI; watch it resolve on recovery
> - [ ] Two simultaneous critical zones stay independently visible
> - [ ] The page states **why** rank 1 outranks rank 2
> - [ ] An offline zone is never rendered as safe
> - [ ] **Review with human before proceeding**

---

# Phase 9 — History, Detail & Administration

## Task 50: Incident history page

**Description:** Searchable, filterable table with filters held in **URL search params** so a filtered view survives reload and can be shared (criterion 16).

**Acceptance criteria:**
- [ ] Filters: date range, zone, status, hazard type, acknowledged by — all reflected in the URL.
- [ ] Columns: incident ID, zone, main hazard, maximum risk, started, acknowledged, resolved, duration, acknowledged by, status.
- [ ] Server-side pagination with page size control; empty and loading states are explicit.

**Verification:**
- [ ] Component test: changing a filter updates the URL and refires the query with the right params.
- [ ] Manual: apply a date range, reload, filters persist.

**Dependencies:** T49

**Files likely touched:**
- `frontend/src/features/incidents/incident-history-page.tsx` · `incident-filters.tsx` · `frontend/src/components/incidents/incident-table.tsx` · `use-incident-filters.ts`

**Estimated scope:** M

---

## Task 51: Incident detail drawer + timeline + risk-progression chart

**Description:** Selecting a row opens the full story: timeline, risk progression, surrounding readings, actuation events, acknowledgment and resolution detail (criterion 17).

**Acceptance criteria:**
- [ ] Drawer shows complete timeline, risk-score progression (Recharts), readings around the incident, actuation events, acknowledgment and resolution details.
- [ ] Deep-linkable via `?incidentId=` so a specific incident can be shared.
- [ ] Chart handles a single data point and an empty series without crashing.

**Verification:**
- [ ] Component test: the drawer renders the full timeline chain from a fixture.
- [ ] Manual: open a seeded resolved incident and read it end to end.

**Dependencies:** T50

**Files likely touched:**
- `frontend/src/components/incidents/incident-drawer.tsx` · `incident-timeline.tsx` · `frontend/src/components/charts/risk-history-chart.tsx` · `incident-drawer.test.tsx`

**Estimated scope:** M

---

## Task 52: Zone detail page

**Description:** Per-zone drill-down with the historical charts ([spec.md §13](spec.md#zone-detail-zoneszoneid)).

**Acceptance criteria:**
- [ ] Shows current state, risk score, risk contributions (stacked bar), sensor health, last-seen, active incident, latest readings, historical risk chart, state-transition history, actuation state, configuration and asset importance.
- [ ] Subscribes to the `zone:<zoneId>` room for live updates.
- [ ] Raw historical readings are admin-only; staff see the summarised view (criterion 15).

**Verification:**
- [ ] Component test: contributions bar reflects fixture values.
- [ ] Integration/manual: a staff account cannot reach the raw readings view.

**Dependencies:** T51

**Files likely touched:**
- `frontend/src/features/zones/zone-detail-page.tsx` · `zone-contributions.tsx` · `zone-transitions.tsx` · `frontend/src/components/charts/sensor-history-chart.tsx`

**Estimated scope:** M

---

## Task 53: Admin APIs — zone/sensor CRUD, user role management

**Description:** Backend admin surface with real RBAC (criterion 15). Zones are never hard-deleted while incidents reference them (criterion 25).

**Acceptance criteria:**
- [ ] `POST /admin/zones`, `PATCH /admin/zones/:zoneId`, `PATCH /admin/sensors/:sensorId`, `GET /admin/users`, `PATCH /admin/users/:userId/role` — all `requireRole("ADMIN")`.
- [ ] Creating a zone generates its API credential and returns the plaintext key **once**.
- [ ] Deactivation (`isActive = false`) is the only removal path; a hard delete of a zone with incidents is refused.
- [ ] An admin cannot demote their own last-admin account (no lockout).

**Verification:**
- [ ] Integration test: every admin endpoint returns `403` for a `SECURITY_STAFF` token (criterion 15).
- [ ] Integration test: attempting to delete a zone with incidents fails (criterion 25).
- [ ] Integration test: a newly created zone can immediately ingest with its returned key — no code change required (spec §9.1).

**Dependencies:** T52

**Files likely touched:**
- `backend/src/modules/zones/admin-zones.controller.ts` · `backend/src/modules/sensors/sensors.controller.ts` · `backend/src/modules/users/users.controller.ts` · `admin.routes.ts` · `backend/src/tests/integration/admin-rbac.test.ts`

**Estimated scope:** M

---

## Task 54: Manual overrides API + audit log writer

**Description:** [spec.md §9.14](spec.md#914-manual-overrides-admin). Every override is reasoned, audited, and routed through the same idempotent actuation resolver so it cannot double-fire a physical response.

**Acceptance criteria:**
- [ ] `POST /admin/zones/:zoneId/overrides` supports `FORCE_MAINTENANCE_MODE`, `CLEAR_MAINTENANCE_MODE`, `TEST_ACTUATION`, `SILENCE_BUZZER`, `RESET_ACTUATION`, `MARK_SENSOR_MAINTENANCE`, `CLEAR_SENSOR_MAINTENANCE`.
- [ ] A `reason` of at least 5 characters is required; validation failure → `400`.
- [ ] Each override writes a `ManualOverride` row **and** an `AuditLog` row with user, timestamp, action, zone, metadata and IP.
- [ ] Resulting commands are tagged `source: MANUAL_OVERRIDE` and pass through the T34 idempotency diff.
- [ ] A zone in maintenance mode still ingests and stores readings but suppresses incident creation and actuation.

**Verification:**
- [ ] Integration test: an override writes exactly one `ManualOverride` and one `AuditLog` row.
- [ ] Integration test: a maintenance-mode zone stores readings but opens no incident.
- [ ] Integration test: a staff token gets `403`.

**Dependencies:** T53

**Files likely touched:**
- `backend/src/modules/overrides/overrides.controller.ts` · `overrides.service.ts` · `backend/src/modules/audit/audit.service.ts` · `packages/shared/src/schemas/override.schema.ts` · `backend/src/tests/integration/overrides.test.ts`

**Estimated scope:** M

---

## Task 55: System-health API + audit-log API

**Description:** The admin observability surface backing the System Health and Audit Logs pages.

**Acceptance criteria:**
- [ ] `GET /admin/system-health` returns backend status, database connectivity, Socket.IO connection count, zone connectivity, sensor connectivity, last reading per zone, offline zones, failed actuation commands, recent validation failures and recent system events.
- [ ] `GET /admin/audit-logs` is paginated and filterable by user, action, entity type and date range.
- [ ] `GET /zones/:zoneId/system-health` returns the per-zone slice.
- [ ] All three are admin-only.

**Verification:**
- [ ] Integration test asserts each field is populated against a fixture with a known failure mix.
- [ ] Integration test: staff token → `403` on all three.

**Dependencies:** T54

**Files likely touched:**
- `backend/src/modules/system-health/system-health.controller.ts` · `system-health.service.ts` · `backend/src/modules/audit/audit.controller.ts` · `backend/src/tests/integration/system-health.test.ts`

**Estimated scope:** M

---

## Task 56: Administration, System Health and Audit Log pages

**Description:** The admin frontend — zone/sensor forms (RHF + Zod against shared schemas), the override console with its mandatory reason, the health dashboard and the audit table.

**Acceptance criteria:**
- [ ] Zone and sensor management forms validate with shared schemas and surface server errors inline.
- [ ] The override console requires a reason before enabling submit and shows the resulting audit entry.
- [ ] System Health renders every field from T55, with offline zones and failed commands visually prominent.
- [ ] Audit log table paginates and filters; all three pages are unreachable for `SECURITY_STAFF` (route guard **and** backend).

**Verification:**
- [ ] Component test: the override form blocks submission without a reason.
- [ ] Manual: as staff, the pages are absent from nav and deep-linking is denied.

**Dependencies:** T55

**Files likely touched:**
- `frontend/src/features/administration/administration-page.tsx` · `override-console.tsx` · `frontend/src/features/system-health/system-health-page.tsx` · `frontend/src/features/audit/audit-log-page.tsx`

**Estimated scope:** M

---

> ## ▣ Checkpoint J — History & admin
> - [ ] Date-range filtering survives a reload (URL state)
> - [ ] Every admin endpoint returns 403 for a staff token
> - [ ] Every override writes both a `ManualOverride` and an `AuditLog` row
> - [ ] Manual actions are visually distinguishable from sensor-triggered ones
> - [ ] A zone with incidents cannot be hard-deleted
> - [ ] **Review with human before proceeding**

---

# Phase 10 — Simulator & Scenarios

## Task 57: Simulator engine + admin control API

**Description:** Plan decision A7 / [spec.md §14](spec.md#14-simulator-specification). The engine lives backend-side, holds zone API keys, and drives the **real** ingestion API over HTTP. This task defines the control-API contract first, so the frontend track (T61) can proceed in parallel.

**Acceptance criteria:**
- [ ] Per-zone streamers emit readings at a configurable interval with monotonic `sequenceNumber`s and unique `readingId`s.
- [ ] Keys are loaded from `.env.simulator` / `.dev-zone-keys.json` server-side and **never** returned to any client.
- [ ] Control API (admin-only): `POST /simulator/zones/:zoneId/start`, `/stop`, `PATCH /simulator/zones/:zoneId/state`, `GET /simulator/status`.
- [ ] Each submitted payload and its backend response are broadcast as `simulator:payload` / `simulator:response`.
- [ ] The engine never writes to the database directly — only through the ingestion HTTP endpoint.

**Verification:**
- [ ] Integration test: starting a zone produces accepted readings visible via `GET /zones`.
- [ ] Integration test: no simulator response body contains an API key.
- [ ] Code check: `modules/simulator` imports no repository or Prisma client.

**Dependencies:** T56

**Files likely touched:**
- `backend/src/modules/simulator/simulator.engine.ts` · `simulator.controller.ts` · `simulator.routes.ts` · `zone-streamer.ts` · `packages/shared/src/schemas/simulator.schema.ts`

**Estimated scope:** M

---

## Task 58: Fault injection controls

**Description:** The deliberately-wrong buttons that prove the backend's defences: malformed payload, duplicate reading, out-of-order reading, sensor disconnection, zone network disconnection, warm-up mode.

**Acceptance criteria:**
- [ ] Controls for: fire on/off, gas slider, water slider, occupancy on/off, sensor disconnect, zone network disconnect, warm-up mode, reading interval, start/stop.
- [ ] Fault injectors: send malformed payload, send duplicate reading, send out-of-order reading, run a quick SAFE→WARNING→CRITICAL→SAFE cycle.
- [ ] Each injector surfaces the backend's actual status code and error body verbatim — the simulator never masks a rejection.

**Verification:**
- [ ] Integration test: the malformed injector receives `400`; the duplicate injector `409`; the out-of-order injector `201` with `ACCEPTED_OUT_OF_ORDER` and no live-state change.
- [ ] Integration test: sensor disconnect drives the zone to OFFLINE, not SAFE.

**Dependencies:** T57

**Files likely touched:**
- `backend/src/modules/simulator/fault-injection.ts` · `zone-streamer.ts` · `simulator.controller.ts` · `backend/src/tests/integration/simulator-faults.test.ts`

**Estimated scope:** M

---

## Task 59: Scenario definitions 1–5 + headless runner

**Description:** Declarative step lists (`{ atMs, zoneCode, patch }`) so the same definitions drive the UI button **and** the test suite (plan decision A7).

**Acceptance criteria:**
- [ ] Scenarios 1–5 implemented: normal idle · fire debounce · rising gas · server-room water leak · simultaneous multi-zone.
- [ ] `POST /simulator/scenarios/:scenarioId/run` starts a scenario; `pnpm sim:scenario -- --id N` runs it headlessly and exits non-zero on assertion failure.
- [ ] Each scenario declares expected end-state assertions alongside its steps.

**Verification:**
- [ ] `pnpm sim:scenario -- --id 2` shows a flicker producing **no** incident, then sustained fire producing one, then recovery to SAFE.
- [ ] `pnpm sim:scenario -- --id 5` leaves two critical zones ranked with explanations and disjoint actuation commands.

**Dependencies:** T58

**Files likely touched:**
- `backend/src/modules/simulator/scenarios/scenarios.ts` · `scenario-runner.ts` · `backend/scripts/run-scenario.ts` · `backend/src/tests/integration/scenarios-1-5.test.ts`

**Estimated scope:** M

---

## Task 60: Scenarios 6–11

**Description:** The edge-case scenarios — acknowledgment race, sensor offline, dashboard reconnection, invalid sensor value, backend restart recovery, load handling (criterion 27).

**Acceptance criteria:**
- [ ] Scenario 6 fires two concurrent acknowledgments and reports `1 × 200, 1 × 409`.
- [ ] Scenario 7 disconnects a sensor and asserts OFFLINE, never SAFE or empty.
- [ ] Scenario 8 drops the socket, raises a critical incident, reconnects, and asserts the dashboard catches up with no duplicate alerts.
- [ ] Scenario 9 sends a negative water level and gas > 1 and asserts rejection with no risk computed from bad data.
- [ ] Scenario 10 persists an active incident, restarts the backend, and asserts state and queue survive.
- [ ] Scenario 11 drives ≥ 30 zones and asserts submitted-accepted reading counts reconcile exactly.
- [ ] Every scenario ends with the **agreement assertion**: frontend view, API response and database row agree on each zone's state (criterion 28).

**Verification:**
- [ ] `pnpm sim:scenario -- --id N` passes for N = 6…11.
- [ ] Scenario 11 reports zero lost and zero duplicated accepted readings.

**Dependencies:** T59

**Files likely touched:**
- `backend/src/modules/simulator/scenarios/scenarios.ts` · `scenario-assertions.ts` · `backend/src/tests/integration/scenarios-6-11.test.ts` · `backend/scripts/run-scenario.ts`

**Estimated scope:** M

---

## Task 61: Frontend simulator page

**Description:** The control surface. It must **never** mutate dashboard state directly — everything it displays comes back through the normal API/socket path (spec §14).

**Acceptance criteria:**
- [ ] One card per zone with every control from T58.
- [ ] Displays the latest submitted raw payload (pretty JSON), the backend response including status code, zone API authentication status, and simulated LED/buzzer/relay state.
- [ ] A scenario launcher runs all eleven scenarios with one click each and shows progress.
- [ ] Admin-only route; no API key is ever rendered or held client-side.

**Verification:**
- [ ] Component test: the page renders payload and response from `simulator:*` socket events, not from local state.
- [ ] Manual: run every scenario from the UI and watch the Command Center respond.
- [ ] Code check: no `X-Zone-API-Key` string appears anywhere in `frontend/src`.

**Dependencies:** T60

**Files likely touched:**
- `frontend/src/features/simulator/simulator-page.tsx` · `frontend/src/components/simulator/zone-simulator-card.tsx` · `scenario-launcher.tsx` · `payload-inspector.tsx`

**Estimated scope:** M

---

## Task 62: Load generator, 10 000-reading seed, performance gate

**Description:** Criterion 26 — the 24-hour incident query must stay fast with real data volume, and the gate must **fail the build** on a sequential scan rather than quietly passing.

**Acceptance criteria:**
- [ ] `scripts/load-generator.ts` seeds ≥ 10 000 readings across 7 days plus ≥ 200 incidents, with a `--zones` flag for the 30-zone case.
- [ ] `scripts/explain-hot-queries.ts` runs `EXPLAIN ANALYZE` on "all CRITICAL or active incidents from the last 24 hours across all zones" and **exits non-zero** on a sequential scan or > 50 ms.
- [ ] `pnpm db:seed:load` and `pnpm db:explain` are wired at the root.
- [ ] Seeded history includes ≥ 5 resolved incidents, exactly 1 acknowledged incident, and sample audit logs (spec §10 seed data).

**Verification:**
- [ ] `pnpm db:seed:load && pnpm db:explain` passes and prints the index name and timing.
- [ ] Deliberately dropping the index makes `pnpm db:explain` fail — proving the gate has teeth.

**Dependencies:** T61

**Files likely touched:**
- `backend/scripts/load-generator.ts` · `backend/scripts/explain-hot-queries.ts` · `backend/prisma/seeds/history.seed.ts` · `package.json`

**Estimated scope:** M

---

> ## ▣ Checkpoint K — Scenarios
> - [ ] All 11 scenarios run from the UI **and** headlessly
> - [ ] Scenario 11 sustains ≥ 30 zones with zero lost/duplicated accepted readings
> - [ ] `pnpm db:explain` proves an index scan under 50 ms — and fails when the index is dropped
> - [ ] Every scenario ends with frontend, API and database agreeing on zone state
> - [ ] **Review with human before proceeding**

---

# Phase 11 — Quality, Security & Documentation

## Task 63: Security hardening

**Description:** [spec.md §16](spec.md#16-non-functional-requirements) security row. Applied as one deliberate pass so nothing is half-configured.

**Acceptance criteria:**
- [ ] Helmet enabled with a sensible CSP for the API; CORS restricted to `CORS_ORIGINS` (no wildcard with credentials).
- [ ] Body size limited to 1 MB; per-route rate limits — auth 5/min, API 300/min, ingestion 1200/min — returning `429 RATE_LIMITED`.
- [ ] Log redaction verified for `authorization`, `x-zone-api-key`, `password`, `passwordHash`, `apiKey`.
- [ ] No secret, hash or key appears in any response body; error responses never leak stack traces in production mode.

**Verification:**
- [ ] Integration tests: a cross-origin request from a disallowed origin is refused; an oversized body → `413`; the rate limit trips at the configured threshold.
- [ ] A log-capture test asserts `[Redacted]` in place of a submitted API key.

**Dependencies:** T62

**Files likely touched:**
- `backend/src/app.ts` · `backend/src/middleware/rate-limit.middleware.ts` · `backend/src/config/logger.ts` · `backend/src/tests/integration/security.test.ts`

**Estimated scope:** M

---

## Task 64: OpenAPI generation + Swagger UI

**Description:** Criterion 29. Generated from the shared Zod schemas so docs cannot drift from validation. Timeboxed — the documented fallback is a hand-authored YAML served by the same mount (plan risk R3).

**Acceptance criteria:**
- [ ] Every endpoint in [spec.md §11](spec.md#11-api-contract) documented with example request and response bodies, including error envelopes.
- [ ] Both security schemes described: `bearerAuth` (JWT) and `zoneApiKey` (`X-Zone-API-Key`).
- [ ] Swagger UI served at `/api/v1/docs`; `pnpm docs:openapi` emits `docs/openapi.json`.

**Verification:**
- [ ] `/api/v1/docs` renders and every listed endpoint appears.
- [ ] The emitted document passes an OpenAPI 3.1 validator.

**Dependencies:** T63

**Files likely touched:**
- `backend/src/config/openapi.ts` · `backend/src/docs/paths/*.ts` · `backend/src/app.ts` · `backend/scripts/emit-openapi.ts`

**Estimated scope:** M

---

## Task 65: Backend Dockerfile + Compose wiring

**Description:** Make the backend containerisable so a reviewer can run the whole stack with Compose.

**Acceptance criteria:**
- [ ] Multi-stage Dockerfile (build → slim runtime), non-root user, healthcheck hitting `/health`.
- [ ] `docker-compose.yml` gains an optional `backend` service depending on a healthy `postgres`, with migrations applied on start.
- [ ] Image builds without dev dependencies in the runtime layer.

**Verification:**
- [ ] `docker compose up --build` brings up postgres + backend; `curl localhost:4000/health` succeeds against the container.

**Dependencies:** T64

**Files likely touched:**
- `backend/Dockerfile` · `backend/.dockerignore` · `docker-compose.yml`

**Estimated scope:** S

---

## Task 66: Documentation set + Mermaid diagrams

**Description:** The nine documents from [spec.md §5](spec.md#5-project-structure) `docs/`, covering everything the prompt's documentation deliverables list.

**Acceptance criteria:**
- [ ] `architecture.md` (system + data flow + Mermaid), `api.md` (endpoints + example payloads), `database-schema.md` (ERD + relationships), `risk-fusion.md` (formula, **weight justification**, debounce logic), `priority-ranking.md` (formula + worked example), `security.md` (auth, RBAC, race handling, JWT-storage tradeoff), `resilience.md` (restart recovery, offline handling, scaling to 30+ zones), `demo-scenarios.md` (all 11 with expected outcomes), `data-retention.md`.
- [ ] Mermaid diagrams for the ingestion pipeline, the incident state machine and the ERD.
- [ ] Every documented formula matches the shipped config defaults — checked, not assumed.

**Verification:**
- [ ] Mermaid blocks render without syntax errors.
- [ ] Spot-check: the risk weights in `risk-fusion.md` equal those in `risk.config.ts`.

**Dependencies:** T65

**Files likely touched:**
- `docs/architecture.md` · `docs/risk-fusion.md` · `docs/priority-ranking.md` · `docs/resilience.md` · `docs/diagrams/*.mmd` (+ the remaining docs)

**Estimated scope:** M

---

## Task 67: Data retention + backup scripts

**Description:** Document and script the retention policy from the prompt: 90-day raw readings, hourly aggregation, longer incident retention, daily `pg_dump`, documented recovery and data-loss window.

**Acceptance criteria:**
- [ ] `docs/data-retention.md` states the full policy, the recovery process and the possible data-loss window.
- [ ] `scripts/retention.ts` purges readings older than 90 days and writes hourly aggregates; dry-run by default.
- [ ] `scripts/backup.sh` produces a timestamped `pg_dump` artefact and documents the restore command.
- [ ] Scripts are **not scheduled by default** — spec §19 open question 6.

**Verification:**
- [ ] `pnpm db:backup` produces a restorable dump; restoring it into a scratch database succeeds.
- [ ] Retention dry-run reports the correct row count without deleting.

**Dependencies:** T66

**Files likely touched:**
- `backend/scripts/retention.ts` · `backend/scripts/backup.sh` · `docs/data-retention.md` · `package.json`

**Estimated scope:** S

---

## Task 68: README — clean-clone walkthrough + demo script

**Description:** Criterion 30 — another developer must be able to run the complete system following only the README, and an operator must be able to run the seven-minute demo from it.

**Acceptance criteria:**
- [ ] Prerequisites, clone → install → `db:up` → migrate → seed → dev, with the **5433 port note** (plan risk R11).
- [ ] Development-only credentials stated as such, with a warning.
- [ ] Where zone API keys are written and why they are gitignored.
- [ ] A seven-minute demo script naming which scenario to run when and what to point at.
- [ ] Troubleshooting section: port conflicts, Docker not running, migration drift, stale `dist` in the shared package.
- [ ] Links to `docs/` and `/api/v1/docs`.

**Verification:**
- [ ] **Clean-clone test:** in a fresh directory, follow only the README and reach a working dashboard with seeded data.

**Dependencies:** T67

**Files likely touched:**
- `README.md` · `frontend/README.md` · `backend/README.md`

**Estimated scope:** S

---

## Task 69: Acceptance sweep — all 30 criteria

**Description:** The gate before bonuses. Walk [spec.md §18](spec.md#18-success-criteria) end to end, record how each criterion is verified, and fix whatever fails. This is a verification task, not a feature task.

**Acceptance criteria:**
- [ ] A checklist maps each of the 30 criteria to the specific test name or manual step that proves it, with results recorded.
- [ ] Coverage gates met: ≥ 90 % `risk-engine` / `priority-engine`; ≥ 80 % `ingestion`, `incidents`, `acknowledgments`, `actuation`; ≥ 60 % backend overall.
- [ ] The full suite passes in a **shuffled** order (plan risk R5).
- [ ] Any failure is fixed, not waived; anything genuinely deferred is written down explicitly.

**Verification:**
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- [ ] `pnpm --filter backend test:coverage` meets every threshold.
- [ ] All 11 scenarios pass headlessly in one run.

**Dependencies:** T68

**Files likely touched:**
- `specs-and-planning/acceptance-results.md` · plus whatever fixes the sweep surfaces

**Estimated scope:** M

---

> ## ▣ Checkpoint L — CORE COMPLETE / DEMO-READY 🔒 **HARD GATE**
> - [ ] All 30 acceptance criteria demonstrably pass
> - [ ] `/api/v1/docs` renders every endpoint with examples
> - [ ] A clean clone runs following only the README
> - [ ] Coverage gates met; suite passes shuffled
> - [ ] All 11 scenarios pass headlessly
> - [ ] **Phase 12 may not begin until this checkpoint is signed off by the human**

---

# Phase 12 — Bonus Features

> Gated behind Checkpoint L (plan decision A11). Abandoning this phase costs zero core criteria.

## Task 70: Bonus 1 — short-term risk trend

**Description:** [spec.md §15.1](spec.md#151-bonus-1--short-term-risk-trend). Trend is advisory only — it must remain strictly separate from current state and must never influence incidents, priority or actuation.

**Acceptance criteria:**
- [ ] Moving average + least-squares slope over the last `TREND_WINDOW_READINGS` (default 20) accepted readings.
- [ ] Classified `STABLE` / `RISING` / `FALLING` / `TRENDING_CRITICAL` (rising and projected to cross 65 within `TREND_HORIZON_S`).
- [ ] Persisted on `Zone`, broadcast as `trend:updated`, rendered as a sparkline + arrow **visually separate from the state badge**.
- [ ] Trend appears nowhere in the risk, incident, priority or actuation code paths.

**Verification:**
- [ ] Unit tests: flat, rising, falling and noisy series classify correctly.
- [ ] Test: forcing `TRENDING_CRITICAL` on a SAFE zone changes neither its state nor its actuation.

**Dependencies:** T69 (Checkpoint L signed off)

**Files likely touched:**
- `backend/src/modules/trend/trend.service.ts` · `trend.service.test.ts` · `backend/prisma/schema.prisma` · `frontend/src/components/zones/trend-indicator.tsx`

**Estimated scope:** M

---

## Task 71: Bonus 2a — synthetic training data + model training + metrics

**Description:** [spec.md §15.2](spec.md#152-bonus-2--ml-predicted-risk). Logistic regression trained offline on **explicitly synthetic** data; coefficients exported to JSON so runtime inference needs no Python and no external service.

**Acceptance criteria:**
- [ ] `scripts/train-risk-model.ts` generates labelled synthetic sequences and trains on features: current risk, fire streak length, gas slope, water slope, occupancy, seconds since last transition, asset importance.
- [ ] Coefficients exported to `backend/src/modules/prediction/model.json`.
- [ ] `docs/ml-model.md` reports accuracy, precision, recall, F1, AUC and a confusion matrix on a held-out split, and states plainly that the training data is synthetic.
- [ ] Training is reproducible from a fixed seed.

**Verification:**
- [ ] `pnpm ml:train` produces `model.json` and refreshes the metrics in `docs/ml-model.md`.
- [ ] Re-running with the same seed produces identical coefficients.

**Dependencies:** T70

**Files likely touched:**
- `backend/scripts/train-risk-model.ts` · `backend/src/modules/prediction/features.ts` · `model.json` · `docs/ml-model.md`

**Estimated scope:** M

---

## Task 72: Bonus 2b — inference module, API, distinct UI, no-actuation architecture test

**Description:** Serve the prediction with a **mechanically enforced** safety boundary (plan decision A10): the prediction module has no import path to actuation or incidents, and a test proves it.

**Acceptance criteria:**
- [ ] Pure-TypeScript inference returns *P(CRITICAL within 60 s)* per zone, broadcast as `prediction:updated`.
- [ ] Rendered in a visually distinct panel with a `PREDICTED` badge, never mixed with the live risk score.
- [ ] `modules/prediction` imports nothing from `actuation`, `incidents` or `zone-state` — asserted by an **architecture test** that scans the import graph.
- [ ] Prediction can be disabled with `PREDICTION_ENABLED=false` and the system behaves identically without it.

**Verification:**
- [ ] Architecture test fails if a forbidden import is added.
- [ ] Integration test: a high predicted probability on a SAFE zone creates no incident and no actuation command.
- [ ] Visual check: predicted risk is unmistakably distinct from live risk.

**Dependencies:** T71

**Files likely touched:**
- `backend/src/modules/prediction/prediction.service.ts` · `prediction.controller.ts` · `backend/src/tests/architecture/prediction-boundaries.test.ts` · `frontend/src/components/zones/predicted-risk-panel.tsx`

**Estimated scope:** M

---

## Task 73: Bonus 3a — deterministic NL extractor + validation gate + API

**Description:** [spec.md §15.3](spec.md#153-bonus-3--natural-language-incident-report). The default path is fully deterministic — no paid service is ever required — and every path, LLM or not, passes the identical validation gate.

**Acceptance criteria:**
- [ ] `POST /reports/natural-language` accepts free text and returns `{ zone, hazardType, estimatedSeverity, confidence, confirmationMessage }`.
- [ ] The default extractor (`AI_PROVIDER=none`) uses zone-alias matching against the zone table, a hazard keyword lexicon and a severity/hedging lexicon.
- [ ] An optional `AI_PROVIDER=anthropic` path passes through **exactly the same** Zod + zone-existence + severity-clamp gate.
- [ ] The result is stored as an `IncidentReport` with `status = PENDING`; it creates no incident, sets no zone state, and triggers no actuation.

**Verification:**
- [ ] Unit tests: the spec's example text ("Smell of gas near the IoT Lab bench, not sure how bad") extracts zone `iot-lab`, hazard `GAS`, moderate severity, reduced confidence from the hedge.
- [ ] Unit test: a report naming a nonexistent zone is rejected by the gate.
- [ ] Integration test: submitting a report creates no incident and no actuation command.
- [ ] Test: the whole feature works with `AI_PROVIDER=none` and no API key present.

**Dependencies:** T72

**Files likely touched:**
- `backend/src/modules/reports/extractor.deterministic.ts` · `reports.service.ts` · `reports.controller.ts` · `validation-gate.ts` · `extractor.deterministic.test.ts`

**Estimated scope:** M

---

## Task 74: Bonus 3b — confirmation flow + bounded priority bonus + UI

**Description:** A human must confirm a report before it can influence anything, and even then its influence is bounded and auditable.

**Acceptance criteria:**
- [ ] `POST /reports/:reportId/confirm` (ADMIN) moves a report to `CONFIRMED` and writes an `AuditLog` row.
- [ ] Only a confirmed report contributes `humanReportBonus` (max +5, `PRIORITY_HUMAN_REPORT_BONUS_MAX`) to the matching zone's active incident priority — surfaced in the ranking explanation as a distinct reason line.
- [ ] A `PENDING` report influences nothing.
- [ ] The submission form and a pending-reports list are available to both roles; confirmation is admin-only.

**Verification:**
- [ ] Integration test: a pending report leaves the priority score unchanged; confirming it raises it by at most 5 and adds an explanation line.
- [ ] Integration test: a staff token gets `403` on confirm.
- [ ] Component test: the form submits and renders the confirmation message.

**Dependencies:** T73

**Files likely touched:**
- `backend/src/modules/reports/reports.controller.ts` · `backend/src/modules/priority-engine/priority.service.ts` · `frontend/src/features/reports/report-form.tsx` · `pending-reports.tsx`

**Estimated scope:** M

---

> ## ▣ Checkpoint M — Bonuses
> - [ ] Trend is visually separate from state and provably never affects it
> - [ ] Predicted risk carries a `PREDICTED` badge; the architecture test proves it cannot actuate
> - [ ] The NL extractor works with no paid service and cannot create an incident
> - [ ] All 30 core criteria still pass — no regression from bonus work
> - [ ] **Final review with human**

---

## Summary

| Phase | Tasks | Focus | Gate |
|---|---|---|---|
| 0 | T01–T04 | Workspace, shared contract, backend skeleton | A |
| 1 | T05–T09 | Prisma schema, indexes, partial unique index | B |
| 2 | T10–T14 | Auth, RBAC middleware, seeded users | C |
| 3 | T15–T19 | Frontend shell, login ⭐ first e2e slice | D |
| 4 | T20–T23 | Pure risk + sensor engines | E |
| 5 | T24–T30 | Zones, ingestion pipeline, offline ⭐ | F |
| 6 | T31–T38 | Incidents, ack race, actuation, priority, restart | G |
| 7 | T39–T42 | Socket.IO, dashboard summary, client de-dupe | H |
| 8 | T43–T49 | Command Center UI ⭐ full live loop | I |
| 9 | T50–T56 | History, zone detail, admin, audit | J |
| 10 | T57–T62 | Simulator, 11 scenarios, load + perf gate | K |
| 11 | T63–T69 | Security, Swagger, Docker, docs, README, sweep | **L 🔒** |
| 12 | T70–T74 | Trend, ML prediction, NL reports | M |

**Approval gate.** Implementation (Phase 4 of the spec-driven workflow) begins
only after [spec.md](spec.md), [plan.md](plan.md) and this document are approved.
