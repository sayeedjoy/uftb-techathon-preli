# Implementation Plan: Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)

**Status:** Draft — awaiting human approval
**Phase:** 2 of 4 (SPECIFY ✅ → **PLAN** → TASKS → IMPLEMENT)
**Derived from:** [spec.md](spec.md) · **Source requirement:** [prompt.md](prompt.md)
**Companion:** [tasks.md](tasks.md) — 74 ordered, individually verifiable tasks
**Last updated:** 2026-07-25

---

## 1. Overview

We are building a three-package pnpm workspace: a shared wire-contract package,
an Express/Prisma/Socket.IO backend that is the sole authority for hazard
computation, and the existing React/Vite/shadcn frontend extended into an
emergency command centre. The work is sequenced so that the highest-risk,
most-depended-upon logic — the pure risk engine and the ingestion pipeline —
lands early and under test, and so that a runnable, demonstrable system exists
from Checkpoint D onward rather than only at the end.

The plan is **74 tasks across 13 phases with 13 checkpoints**. No task touches
more than five files. Every task ends with the same gate:
`pnpm typecheck && pnpm lint && pnpm test` green and the app still boots.

---

## 2. Architecture Decisions

These are the decisions that shape the task graph. Full rationale lives in
[spec.md §2](spec.md#2-assumptions--resolved-decisions).

| # | Decision | Consequence for the plan |
|---|---|---|
| **A1** | **Shared package owns the wire contract** (`@scsrg/shared`: enums, Zod schemas, `ApiResponse<T>`, Socket event map). | Phase 0 must land before *anything* else. Once it exists, frontend and backend tracks can proceed in parallel against a frozen contract. |
| **A2** | **Risk and priority engines are pure functions** — no clock, no I/O, no Prisma. Time and config are injected. | They can be built and fully unit-tested (Phase 4, T20–T23; T35) before the database pipeline that calls them exists. Also makes timing tests deterministic — no `sleep()` anywhere. |
| **A3** | **The ingestion pipeline's steps 9–14 run in one database transaction.** | A crash can never leave a reading stored without its transition, or an incident open without a timeline row. Also makes the "< 1 s CRITICAL → actuation" NFR trivially true (same transaction, milliseconds). |
| **A4** | **"One active incident per zone" is enforced by a partial unique index**, not by application logic. | Requires a hand-edited migration (Prisma's DSL cannot express `WHERE status IN (...)`) — isolated into its own task, T08, so the friction is contained. |
| **A5** | **Acknowledgment safety is belt-and-braces:** `UNIQUE(incidentId)` *plus* a conditional `UPDATE ... WHERE status='OPEN'` inside a transaction. | T33 ships with a 10-way concurrent test as its acceptance criterion, not as a follow-up. |
| **A6** | **Sockets carry `eventId` + `emittedAt`; the client keeps a bounded LRU and suppresses pre-connection events.** | Reconnect de-duplication (criterion 21, scenario 8) is a property of the transport layer, designed in at T39/T42 rather than patched into each toast site. |
| **A7** | **Simulator engine runs backend-side** (spec D2), driving the real ingestion API over HTTP with server-held zone keys. | The simulator is a *backend* module with a thin admin-authenticated control API; the frontend page is a control surface only. Scenarios are declarative step lists, so they run headlessly in tests **and** from the UI — the same definitions back both. |
| **A8** | **Restart recovery is an explicit bootstrap module**, not scattered lazy initialisation. | T38 is a single task with one integration test that seeds a mid-incident database, boots the app and asserts equality. |
| **A9** | **In-memory state (debounce counters, actuator last-known state) must be rebuildable from Postgres.** | Every in-memory map gets a `rehydrate()` used by T38. No in-memory value is ever the only copy. |
| **A10** | **Prediction (bonus 2) has no import path to actuation or incidents.** | Enforced by an architecture test in T72, so the safety boundary is mechanical rather than a promise. |
| **A11** | **Bonuses are hard-gated behind Checkpoint L.** | Phase 12 cannot start until all 30 core acceptance criteria pass. Protects the seven-minute demo. |

---

## 3. Dependency Graph

```text
                    ┌─────────────────────────────┐
                    │ P0  Workspace + shared pkg  │  T01–T04   BLOCKING
                    │     env, docker, logger     │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ P1  Prisma schema + indexes │  T05–T09   BLOCKING
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ P2  Auth + RBAC + seed users│  T10–T14
                    └──────┬───────────────┬──────┘
                           │               │
        ┌──────────────────▼───┐      ┌────▼──────────────────────────┐
        │ P3  Frontend shell   │      │ P4  Pure engines              │
        │     login, router    │      │     risk, debounce, warm-up   │
        │     T15–T19          │      │     T20–T23                   │
        └──────────────────┬───┘      └────┬──────────────────────────┘
                           │               │
                           │      ┌────────▼──────────────────────────┐
                           │      │ P5  Zones + ingestion pipeline    │
                           │      │     validation, dup, order,       │
                           │      │     transaction, offline  T24–T30 │
                           │      └────────┬──────────────────────────┘
                           │               │
                           │      ┌────────▼──────────────────────────┐
                           │      │ P6  Incidents, ack, actuation,    │
                           │      │     priority, restart   T31–T38   │
                           │      └────────┬──────────────────────────┘
                           │               │
                           └───────┬───────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ P7  Real-time transport     │  T39–T42
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ P8  Command Center UI       │  T43–T49
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
   ┌──────────▼───────────┐                 ┌───────────▼──────────┐
   │ P9  History, detail, │                 │ P10 Simulator +      │
   │     admin  T50–T56   │                 │     scenarios T57–T62│
   └──────────┬───────────┘                 └───────────┬──────────┘
              └────────────────────┬────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │ P11 Security, docs, README  │  T63–T69
                    │     ACCEPTANCE SWEEP        │
                    └──────────────┬──────────────┘
                                   │  ← HARD GATE (Checkpoint L)
                    ┌──────────────▼──────────────┐
                    │ P12 Bonuses 1, 2, 3         │  T70–T74
                    └─────────────────────────────┘
```

**Bottom-up reasoning.** The database schema gates the repositories, which gate
the services, which gate the API, which gates the frontend client, which gates
the UI. The two genuine exceptions are the pure engines (A2 — no database
dependency, so they run parallel to the frontend shell) and the shared package
(A1 — the contract everything else is written against).

---

## 4. Vertical Slicing

The plan deliberately avoids "all schema, then all API, then all UI". After the
unavoidable foundation (P0–P1, which is genuinely horizontal because a wire
contract and a schema cannot be sliced), every phase delivers a working path:

| Phase | The slice a human can actually observe |
|---|---|
| P2 | `curl` login returns a JWT; `/auth/me` returns the user; a staff token gets 403 on an admin route. |
| P3 | **Checkpoint D — you can log in through the browser and navigate the shell.** |
| P4 | `pnpm --filter backend test:unit` proves the risk maths, including every boundary. |
| P5 | **Checkpoint F — POST a raw reading, see the computed risk and state in Postgres.** |
| P6 | An incident opens on CRITICAL, is acknowledged exactly once under 10-way concurrency, and resolves on recovery. |
| P7–P8 | **Checkpoint I — the full live loop: simulate → ingest → score → incident → rank → broadcast → banner → acknowledge → resolve.** |
| P9 | History, zone drill-down, and admin controls with real RBAC. |
| P10 | All eleven demo scenarios, one click each, plus the load harness. |
| P11 | **Checkpoint L — all 30 acceptance criteria pass. This is the demo-ready gate.** |
| P12 | Trend arrow, predicted-risk panel, natural-language report. |

---

## 5. Phase Plan

Full task detail — acceptance criteria, verification commands, files, scope —
is in [tasks.md](tasks.md). Titles only here.

### Phase 0 — Workspace Foundation *(sequential, blocking)*
- T01 Root pnpm workspace, scripts, Prettier, `.gitignore`
- T02 Docker Compose Postgres (host 5433) + `.env.example` files
- T03 `@scsrg/shared`: domain enums, `ApiResponse<T>`, error codes
- T04 Backend skeleton: Express app, Zod-parsed env, Pino logger, error middleware, `/health`

> **▣ Checkpoint A — Foundation**
> `pnpm install && pnpm build && pnpm typecheck && pnpm lint` clean · `pnpm db:up` gives a reachable Postgres on 5433 · `curl localhost:4000/health` returns the success envelope.

### Phase 1 — Data Foundation *(sequential, blocking)*
- T05 Prisma schema I: `User`, `Zone`, `ZoneCredential`, `Sensor`
- T06 Prisma schema II: `SensorReading`, `ZoneStateTransition`, `Incident`, `Acknowledgment`, `IncidentTimelineEvent`
- T07 Prisma schema III: `ActuationCommand`, `ManualOverride`, `AuditLog`, `SystemEvent`, `IncidentReport` + all indexes
- T08 Hand-written migration: partial unique index (one active incident per zone) + `onDelete: Restrict` guards
- T09 Prisma client singleton, transaction helper, repository conventions

> **▣ Checkpoint B — Schema**
> `pnpm db:migrate` applies cleanly from empty · `pnpm db:reset` round-trips · a raw-SQL test proves the partial unique index rejects a second active incident · deleting a zone with incidents fails.

### Phase 2 — Authentication & RBAC
- T10 Shared auth schemas + JWT/bcrypt utilities
- T11 Auth module: `POST /auth/login`, `GET /auth/me`
- T12 `authentication` + `authorization` middleware, RBAC guard matrix
- T13 Seed infrastructure + seeded users
- T14 Auth + RBAC integration tests

> **▣ Checkpoint C — Auth**
> Both seeded accounts log in · bad password returns 401 `INVALID_CREDENTIALS` · a `SECURITY_STAFF` token gets 403 on a guarded route · login is rate-limited at 5/min.

### Phase 3 — Frontend Shell *(parallelisable with Phase 4)*
- T15 Frontend deps + shadcn components; delete stray `frontend/pnpm-workspace.yaml`
- T16 Query client, typed API client, auth storage, provider tree
- T17 Router, route table, role guards, app shell (sidebar + top bar)
- T18 Login page + auth flow + profile page
- T19 Frontend auth/guard tests

> **▣ Checkpoint D — First end-to-end slice** ⭐
> A human opens `http://localhost:5173`, logs in as either seeded user, lands on an (empty) Command Center, sees admin-only nav items only as admin, and reloads without being logged out.

### Phase 4 — Pure Engines *(highest-risk logic, deliberately early)*
- T20 `risk.config` + `computeRisk` + classification + clamping
- T21 Risk explanation generator + boundary and multi-hazard unit tests
- T22 Fire debounce service (asymmetric hysteresis) + tests
- T23 Gas warm-up, water phase, occupancy debounce services + tests

> **▣ Checkpoint E — Engines**
> ≥ 90 % coverage on `risk-engine` · boundaries at 29 / 30 / 64 / 65 asserted exactly · a 4-reading flicker contributes 0 while 5 confirms · gas is suppressed during warm-up · zero `sleep()` calls in the suite.

### Phase 5 — Zones & Ingestion
- T24 Zone repository + service + `GET /zones`, `GET /zones/:zoneId`
- T25 `X-Zone-API-Key` middleware + credential repository
- T26 Ingestion validation (schema, range, timestamp, configured-sensor)
- T27 Duplicate + out-of-order detection
- T28 Ingestion orchestrator transaction (persist → live state → transition)
- T29 Heartbeat endpoint + offline monitor job
- T30 Seed: zones, sensors, credentials, dev key file

> **▣ Checkpoint F — Hazard processing** ⭐
> POSTing a raw reading with a valid key persists the reading **with backend-computed** score, state and contributions · malformed → 400, impossible → 422, duplicate → 409 · an out-of-order reading is stored but does not move live state · a silent zone flips to OFFLINE after the timeout and is never SAFE.

### Phase 6 — Incidents, Actuation & Priority
- T31 Incident lifecycle (open on CRITICAL, resolve on hysteresis-confirmed recovery)
- T32 Timeline events + dominant hazards + max-risk high-water mark
- T33 Concurrency-safe acknowledgment + 10-way race test
- T34 Actuation desired-state resolver + idempotent dispatch
- T35 Priority engine (pure) + determinism and tie-break tests
- T36 Incidents API: list with filters, detail, timeline, acknowledge
- T37 Priority queue API + explanation payload
- T38 Bootstrap restart recovery (8-step) + restart integration test

> **▣ Checkpoint G — Core backend complete**
> Oscillating around the threshold creates exactly one incident · resolve-then-retrigger creates a *second* · 10 concurrent acknowledgments yield 1×200, 9×409, exactly one row · a zone in CRITICAL for a minute emits one buzzer command, not hundreds · shuffled inputs always rank identically · killing and rebooting the backend mid-incident restores state and queue exactly.

### Phase 7 — Real-Time Transport
- T39 Socket.IO server: JWT handshake auth, rooms, typed emitter, `eventId`/`emittedAt` stamping
- T40 Wire domain events into the pipeline
- T41 `GET /dashboard/summary`
- T42 Frontend socket client, reconnect snapshot refetch, LRU de-dupe, connection badge

> **▣ Checkpoint H — Live wire**
> An unauthenticated socket handshake is refused · every domain event carries `eventId` + `emittedAt` · dropping and restoring the connection refetches all four snapshot queries and replays **zero** duplicate notifications.

### Phase 8 — Command Center UI
- T43 State badge, zone card, sensor readout, actuator strip
- T44 Live zone grid + top summary bar
- T45 Priority queue panel + ranking explanation
- T46 Critical alert banner + stacked toasts + alert de-dupe
- T47 Active incident panel + acknowledge mutation + operator note
- T48 Live event feed
- T49 Command Center frontend tests (the eight named flows)

> **▣ Checkpoint I — Live demo of the core loop** ⭐
> Start the simulator, drive a zone to CRITICAL, watch the banner, toast, queue entry and actuator strip appear without a refresh; acknowledge from the UI; watch it resolve. Two simultaneous critical zones both stay visible, and the page states *why* rank 1 outranks rank 2.

### Phase 9 — History, Detail & Administration
- T50 Incident history page (URL-driven filters, table, pagination)
- T51 Incident detail drawer + timeline + risk-progression chart
- T52 Zone detail page + Recharts history + transitions + config
- T53 Admin APIs: zone/sensor CRUD, user role management + 403 tests
- T54 Manual overrides API + audit log writer
- T55 System-health API + admin audit-log API
- T56 Administration, System Health and Audit Log pages

> **▣ Checkpoint J — History & admin**
> Date-range filtering survives a page reload (URL state) · every admin endpoint returns 403 for a staff token · every override writes both a `ManualOverride` and an `AuditLog` row and is visually distinguishable from sensor-triggered actuation.

### Phase 10 — Simulator & Scenarios
- T57 Simulator engine + admin control API
- T58 Fault injection: malformed, duplicate, out-of-order, disconnect, warm-up
- T59 Scenario definitions 1–5 + headless runner
- T60 Scenarios 6–11 + scenario assertions
- T61 Frontend simulator page (cards, controls, payload inspector, scenario launcher)
- T62 Load generator, 10 000+ reading seed, `db:explain` performance gate

> **▣ Checkpoint K — Scenarios**
> All eleven scenarios run from the UI **and** headlessly via `pnpm sim:scenario -- --id N` · scenario 11 sustains ≥ 30 zones with zero lost or duplicated accepted readings · `pnpm db:explain` proves the 24-hour incident query is an index scan under 50 ms.

### Phase 11 — Quality, Security & Documentation
- T63 Security hardening: helmet, CORS allowlist, rate limits, body caps, log redaction
- T64 OpenAPI generation + Swagger UI with examples
- T65 Backend Dockerfile + Compose wiring
- T66 `docs/` set + Mermaid diagrams
- T67 Data retention + `pg_dump` backup scripts
- T68 README: clean-clone walkthrough + seven-minute demo script
- T69 **Acceptance sweep** — all 30 criteria + coverage gates

> **▣ Checkpoint L — CORE COMPLETE / DEMO-READY** 🔒 **HARD GATE**
> All 30 criteria in [spec.md §18](spec.md#18-success-criteria) demonstrably pass · `/api/v1/docs` renders every endpoint · a clean clone runs following only the README · coverage gates met. **Phase 12 may not start until this checkpoint is signed off.**

### Phase 12 — Bonus Features
- T70 Bonus 1: trend engine + API + sparkline
- T71 Bonus 2a: synthetic training data + training script + metrics doc
- T72 Bonus 2b: inference module + API + distinct panel + **no-actuation architecture test**
- T73 Bonus 3a: deterministic NL extractor + validation gate + API
- T74 Bonus 3b: confirmation flow + bounded priority bonus + UI

> **▣ Checkpoint M — Bonuses**
> Trend is visually separate from state and provably never affects it · predicted risk carries a `PREDICTED` badge and an architecture test proves it cannot actuate · the NL extractor needs no paid service and cannot create an incident.

---

## 6. Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| **R1** | **shadcn v4 `base-maia` is built on `@base-ui/react`, not Radix.** Radix-era component snippets will not drop in unchanged. | **High** — could stall every UI task. | T15 adds all components via the CLI *and* smoke-renders the two most divergent primitives (Dialog/Drawer, Select) before any page is built. If a primitive is unavailable, fall back to `@base-ui/react` directly rather than hand-rolling. Discovered at Checkpoint D, not at Checkpoint I. |
| **R2** | **Prisma cannot express a partial unique index** (`WHERE status IN ('OPEN','ACKNOWLEDGED')`) in its DSL. | **High** — this constraint *is* the no-duplicate-incident guarantee (A4). | Isolated in T08 as a hand-edited `migration.sql` with `prisma migrate diff` reconciliation, plus a raw-SQL integration test asserting a second active incident insert fails. Never left to application logic. |
| **R3** | **`zod-openapi` + Zod 4 integration friction** when generating Swagger. | Medium — docs are criterion 29. | T64 timeboxes generation; documented fallback is a hand-authored `docs/openapi.yaml` served by the same `swagger-ui-express` mount. The endpoint contract does not change either way. |
| **R4** | **Express 5 + Socket.IO 4 + Node 24 ESM interop** (`__dirname`, default-export shims, router changes). | Medium | T04 proves the whole stack boots with one route and one socket namespace *before* any module is written. Fail fast in Phase 0. |
| **R5** | **Integration-test database isolation flakiness** (parallel Vitest workers sharing one Postgres). | Medium — flaky tests erode trust in every gate. | Dedicated `scsrg_test` database; the integration Vitest project runs `singleThread` with a truncation helper between tests. Tests must pass in any order — asserted by a shuffled run in T69. |
| **R6** | **React 19 peer-dependency conflicts** (Recharts 3, socket.io-client, RHF). | Medium | T15 installs and smoke-renders one Recharts chart immediately. If Recharts 3 misbehaves under React 19, the fallback is a small SVG sparkline for the zone card plus Recharts confined to the detail pages. |
| **R7** | **Scenario 11 load** (30 zones × 5 Hz = 150 writes/s through a per-reading transaction) may saturate the connection pool. | Medium — criterion "no lost or duplicated readings" is at stake. | Pool sized explicitly in `DATABASE_URL`; ingestion transaction kept minimal (no external calls inside it); broadcast moved *after* commit. Documented fallback: 30 zones at 2 Hz, a config flag, disclosed in the README rather than silently reduced. |
| **R8** | **Timing-dependent tests** (debounce, warm-up, offline sweep) become flaky. | Medium | A2: engines take an injected clock; unit tests advance a fake clock, never `sleep()`. Only the offline-sweeper integration test uses real timers, with the timeout configured down to 300 ms. |
| **R9** | **Scope pressure** — bonuses crowding out core polish before a 7-minute demo. | **High** | A11: Checkpoint L is a hard gate. Phase 12 is explicitly abandonable; abandoning it costs zero core criteria. |
| **R10** | **Frontend/backend contract drift** if someone edits a DTO on one side only. | Medium | A1: the contract lives in `@scsrg/shared` and both packages typecheck against it; `pnpm typecheck` at the root breaks on any drift. |
| **R11** | **Host port 5432 already occupied** by the local psql 18 install. | Low | T02 binds Docker Postgres to **5433** and the `.env.example` matches. Called out in the README. |
| **R12** | **Seeded zone API keys leaking into git.** | Medium (security hygiene) | T30 writes `backend/.dev-zone-keys.json` and `backend/.env.simulator`, both added to `.gitignore` in T01 *before* the seed exists. Only hashes are stored in Postgres. |

---

## 7. Parallelisation

| Track | Tasks | Notes |
|---|---|---|
| **Strictly sequential** | T01–T09 (workspace, shared contract, schema, migrations) | Everything depends on these. No parallelism available or wanted. |
| **Safe to parallelise after T14** | Frontend track T15–T19 ‖ Engine track T20–T23 | Zero shared files; the engines have no database dependency (A2) and the shell has no backend dependency beyond `/auth`. |
| **Safe to parallelise after Checkpoint H** | UI track T43–T49 ‖ Admin-API track T53–T55 | Different packages, contract already frozen. |
| **Safe to parallelise after Checkpoint I** | History/admin UI T50–T56 ‖ Simulator T57–T62 | Coordinate only on the simulator control-API contract, which T57 defines first. |
| **Must stay sequential** | T05→T09 (migrations), T28 (ingestion transaction), T31→T34 (lifecycle + actuation share zone state), T38 (restart depends on all prior state) | Shared mutable state and migration ordering. |
| **Documentation** T66, T68 | Can be drafted in parallel with Phase 10 but must be *verified* against the shipped code at T69. | |

Coordination rule: whenever two tracks touch the same contract, the task that
**defines** the contract (`@scsrg/shared` or the simulator control API) merges
first, and the other track is written against it.

---

## 8. Verification Strategy

Every task carries three gates:

1. **Automated** — the exact command in the task's Verification block.
2. **Global** — `pnpm typecheck && pnpm lint && pnpm test` all green.
3. **Runnable** — `pnpm dev` still boots backend + frontend without error.

Beyond per-task gates, three standing gates run at every checkpoint from F onward:

- **Contract gate:** root `pnpm typecheck` — catches frontend/backend drift (R10).
- **Performance gate:** `pnpm db:explain` — fails on a sequential scan or > 50 ms (criterion 26).
- **Agreement gate:** every scenario run ends by asserting the frontend view, the API response and the database row agree on each zone's state (criterion 28).

---

## 9. What This Plan Deliberately Does Not Do

- **No queue, cache, or second process.** Single backend process (spec D9); `docs/resilience.md` documents what changes at multi-instance scale instead of building it.
- **No deployment automation.** Docker Compose for local Postgres and a backend Dockerfile; production infrastructure is documented, not provisioned.
- **No refresh-token rotation.** Spec D6 — the prompt's API surface defines only `login` and `me`; the tradeoff is written up in `docs/security.md`.
- **No hardware integration.** Actuation is a logged command model with a simulated actuator display, per spec §9.12.

---

## 10. Open Questions

Carried forward from [spec.md §19](spec.md#19-open-questions) — none block the
start of implementation; each has a stated default.

1. Alert sound default (currently **off**).
2. `acknowledgedPenalty = −15` as a score term versus a pure tie-break.
3. Demo reading interval **500 ms** versus the prompt's 200 ms.
4. `OFFLINE` visual treatment — confirm the pulsing amber LED is not confusable with WARNING on a projector.
5. Load-scenario scale — 30 zones @ 5 Hz, fallback 2 Hz.
6. Retention automation scripted but not scheduled.

Plus one new question raised by the plan itself:

7. **Parallel tracks** — is more than one implementation session available? If so, the Phase 3 ‖ Phase 4 split (§7) is worth taking; if not, the plan runs strictly in task order with no change to the outcome.

---

**Approval gate.** Per the spec-driven workflow, implementation begins only
after this plan and [tasks.md](tasks.md) are approved.
