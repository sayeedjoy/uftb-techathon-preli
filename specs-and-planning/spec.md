# Spec: Multi-Hazard Smart Campus Safety & Response Grid (SCS-RG)

**Status:** Draft — awaiting human approval
**Phase:** 1 of 4 (SPECIFY → PLAN → TASKS → IMPLEMENT)
**Source requirement:** [prompt.md](prompt.md)
**Last updated:** 2026-07-25

---

## Table of Contents

1. [Objective](#1-objective)
2. [Assumptions & Resolved Decisions](#2-assumptions--resolved-decisions)
3. [Tech Stack](#3-tech-stack)
4. [Commands](#4-commands)
5. [Project Structure](#5-project-structure)
6. [Code Style](#6-code-style)
7. [Testing Strategy](#7-testing-strategy)
8. [Boundaries](#8-boundaries)
9. [Domain Specification](#9-domain-specification)
10. [Data Model](#10-data-model)
11. [API Contract](#11-api-contract)
12. [Real-Time Contract](#12-real-time-contract)
13. [Frontend Specification](#13-frontend-specification)
14. [Simulator Specification](#14-simulator-specification)
15. [Bonus Feature Specification](#15-bonus-feature-specification)
16. [Non-Functional Requirements](#16-non-functional-requirements)
17. [Configuration Reference](#17-configuration-reference)
18. [Success Criteria](#18-success-criteria)
19. [Open Questions](#19-open-questions)

---

## 1. Objective

### What we are building

A production-quality prototype of a real-time campus emergency monitoring and
response platform. Independent campus zones stream **raw** sensor readings to a
backend that is the sole authority for validation, risk fusion, state
classification, incident lifecycle, response prioritisation, and actuation. A
security command dashboard renders the live picture and lets staff acknowledge
and resolve incidents.

### Who the users are

| User                    | Role             | Primary need                                                                            |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| Campus security officer | `SECURITY_STAFF` | See the most urgent hazard within ~2 seconds and acknowledge it.                        |
| Safety systems admin    | `ADMIN`          | Configure zones/sensors, issue manual overrides, inspect system health and audit trail. |
| Sensor node (zone)      | machine          | Push raw readings and heartbeats; pull actuation commands.                              |
| Demo operator           | `ADMIN`          | Drive scripted hazard scenarios without physical hardware.                              |

### What success looks like

A judge sits at the dashboard for seven minutes. The operator runs eleven
scripted scenarios. In every one, the dashboard, the backend and the database
agree on the current state of every zone; the priority ranking is explained in
plain English; and nothing in the UI ever claims a disconnected sensor is safe.
Killing and restarting the backend mid-incident loses nothing.

### Explicit non-goals

- No physical hardware integration (actuation is a logged command model).
- No production deployment automation (documented, not built).
- No multi-tenant / multi-campus support.
- No mobile-native client (responsive desktop-first web only).

---

## 2. Assumptions & Resolved Decisions

### Verified environment

| Tool             | Version present                                                          |
| ---------------- | ------------------------------------------------------------------------ |
| Node             | v24.16.0                                                                 |
| pnpm             | 11.5.2                                                                   |
| Docker / Compose | 29.6.1 / v5.2.0                                                          |
| psql (host)      | 18.4 — **host port 5432 may be occupied, so Docker Postgres binds 5433** |
| git              | repo initialised, one commit (`e93752b First`)                           |

### Existing frontend — inspected, will be extended, never reinitialised

`frontend/` is already scaffolded and **must not be replaced**:

- React **19.2**, Vite **8**, TypeScript **~6**, Tailwind **4** (CSS-first, `@theme inline`).
- shadcn/ui **v4**, style `base-maia`, base colour `olive`, built on **`@base-ui/react`** — **not Radix**. Component snippets written for Radix-era shadcn will not drop in unchanged.
- Existing files to preserve: [src/index.css](../frontend/src/index.css) (design tokens), [src/components/theme-provider.tsx](../frontend/src/components/theme-provider.tsx) (theme + `d` hotkey), [src/components/ui/button.tsx](../frontend/src/components/ui/button.tsx), [src/lib/utils.ts](../frontend/src/lib/utils.ts), [components.json](../frontend/components.json), [vite.config.ts](../frontend/vite.config.ts), [.prettierrc](../frontend/.prettierrc), [eslint.config.js](../frontend/eslint.config.js).
- `src/App.tsx` is placeholder content and **will** be replaced by the router shell.
- Missing runtime deps to add: `react-router`, `@tanstack/react-query`, `socket.io-client`, `react-hook-form`, `@hookform/resolvers`, `zod`, `recharts`, `sonner`, `date-fns`.
- `frontend/pnpm-workspace.yaml` (`packages: []`) will be **removed** and replaced by a root workspace file.

### Decisions taken (confirmed with the human)

| #   | Decision                                                                                                                                                                                                                       | Rationale                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **pnpm workspace with a shared package** — `packages/shared` (`@scsrg/shared`) holds Zod schemas, domain enums, the API envelope type, and the Socket.IO event map.                                                            | One source of truth for everything that crosses the wire; frontend and backend cannot drift.                                                                    |
| D2  | **Simulator engine runs in the backend**, driven by admin-authenticated control endpoints from the frontend Simulator page. Zone API keys never reach the browser; the engine POSTs over real HTTP to `/api/v1/ingestion/...`. | Keeps secrets server-side while genuinely exercising the ingestion path. Raw payload + backend response are streamed back over Socket.IO for demo transparency. |
| D3  | **All three bonus features are in scope** (risk trend, ML predicted risk, natural-language incident report), sequenced strictly after core acceptance criteria pass.                                                           | Human requested full scope. Phase gating protects the core demo.                                                                                                |

### Additional decisions taken by default (flag now if wrong)

| #   | Decision                                                                                                                                                                               | Rationale                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4  | **Vitest** for backend _and_ frontend; Supertest for HTTP integration.                                                                                                                 | ESM-native, one mental model, shared config idioms. Prompt allowed either.                                                                                                       |
| D5  | **Zod v4** in the shared package, used for runtime validation _and_ OpenAPI generation via `zod-openapi`.                                                                              | Avoids maintaining schemas twice. Fallback: hand-authored OpenAPI YAML (see Risk R3 in the plan).                                                                                |
| D6  | **JWT access token (60 min) returned by `POST /auth/login`, stored in `localStorage`**, sent as `Authorization: Bearer`. Socket.IO authenticates with the same token in the handshake. | The prompt's API surface defines only `login` + `me` — no refresh endpoint. Tradeoff (XSS exposure vs. an httpOnly refresh-cookie rotation) is documented in `docs/security.md`. |
| D7  | **PostgreSQL 18 via Docker Compose on host port 5433**; `DATABASE_URL` remains swappable for hosted Postgres.                                                                          | Host already runs psql 18 which likely owns 5432.                                                                                                                                |
| D8  | **Backend on port 4000**, frontend dev server on 5173 with a `/api` + `/socket.io` proxy to 4000.                                                                                      | Same-origin in dev removes CORS friction; CORS is still configured and tested for the deployed case.                                                                             |
| D9  | **A single backend process** owns the heartbeat sweeper, the simulator engine and the HTTP/Socket server.                                                                              | Prototype scale. `docs/resilience.md` documents what changes at multi-instance scale (advisory locks / a dedicated worker).                                                      |
| D10 | **Money-free AI**: bonus 3 defaults to a deterministic rule-based extractor (`AI_PROVIDER=none`). An LLM provider is opt-in and never required.                                        | Prompt mandates a deterministic fallback.                                                                                                                                        |

---

## 3. Tech Stack

### Shared — `packages/shared`

TypeScript 5.9+/6, Zod 4. Zero runtime dependencies beyond Zod. Built with `tsc` to `dist/` (ESM + `.d.ts`), consumed by both apps via workspace protocol.

### Backend — `backend/`

| Concern    | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Runtime    | Node 24 (ESM, `"type": "module"`)                             |
| HTTP       | Express 5                                                     |
| Language   | TypeScript (strict)                                           |
| Realtime   | Socket.IO 4                                                   |
| Database   | PostgreSQL 18                                                 |
| ORM        | Prisma 6                                                      |
| Validation | Zod 4 (via `@scsrg/shared`)                                   |
| Auth       | `jsonwebtoken`, `bcrypt`                                      |
| Logging    | `pino` + `pino-http` (+ `pino-pretty` in dev), with redaction |
| Docs       | `zod-openapi` + `swagger-ui-express` at `/api/v1/docs`        |
| Security   | `helmet`, `cors`, `express-rate-limit`, body-size limits      |
| Testing    | Vitest + Supertest                                            |
| Dev runner | `tsx watch`                                                   |

### Frontend — `frontend/` (extended, not replaced)

React 19.2 · Vite 8 · TypeScript · Tailwind 4 · shadcn/ui v4 (base-maia, `@base-ui/react`) · React Router 7 · TanStack Query 5 · socket.io-client 4 · React Hook Form 7 + Zod resolver · Recharts 3 · lucide-react · sonner (toasts) · date-fns.

### Infrastructure

Docker Compose (postgres + optional pgadmin) · `.env.example` per package · Prisma migrations + seed · ESLint 10 + Prettier 3 · `concurrently` for the root `dev` script.

---

## 4. Commands

All commands run from the **repository root** unless stated. pnpm is the only supported package manager.

### First-time setup

```bash
pnpm install
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
pnpm db:up                 # docker compose up -d postgres  (host port 5433)
pnpm --filter @scsrg/shared build
pnpm db:migrate            # pnpm --filter backend exec prisma migrate dev
pnpm db:seed               # seeds users, 3 zones, sensors, keys, history
```

### Daily development

```bash
pnpm dev                   # concurrently: shared --watch, backend, frontend
pnpm --filter backend dev          # tsx watch src/server.ts        -> :4000
pnpm --filter frontend dev         # vite                            -> :5173
pnpm --filter @scsrg/shared dev    # tsc --watch
```

### Verification gates (must pass before any task is called done)

```bash
pnpm typecheck             # tsc --noEmit across all three packages
pnpm lint                  # eslint across all three packages
pnpm lint:fix              # eslint --fix
pnpm format                # prettier --write "**/*.{ts,tsx,md,json}"
pnpm test                  # vitest run   (backend unit+integration, frontend)
pnpm build                 # shared -> backend (tsc) -> frontend (tsc -b && vite build)
```

### Scoped test commands

```bash
pnpm --filter backend test                 # vitest run
pnpm --filter backend test:unit            # vitest run src/modules
pnpm --filter backend test:integration     # vitest run src/tests/integration
pnpm --filter backend test:watch           # vitest
pnpm --filter backend test:coverage        # vitest run --coverage
pnpm --filter frontend test                # vitest run
pnpm --filter frontend test:ui             # vitest --ui
```

### Database

```bash
pnpm db:up                 # docker compose up -d postgres
pnpm db:down               # docker compose down
pnpm db:reset              # prisma migrate reset --force  (drops + reseeds)
pnpm db:migrate            # prisma migrate dev
pnpm db:deploy             # prisma migrate deploy         (CI/prod)
pnpm db:studio             # prisma studio
pnpm db:seed               # tsx prisma/seed.ts
pnpm db:seed:load          # tsx scripts/load-generator.ts --readings 10000
pnpm db:explain            # tsx scripts/explain-hot-queries.ts   (asserts index usage)
pnpm db:backup             # bash scripts/backup.sh  -> pg_dump artefact
```

### Demo / operations

```bash
pnpm sim:scenario -- --id 5                # run demo scenario 5 headlessly
pnpm sim:load -- --zones 30 --hz 5         # scenario 11 load harness
pnpm ml:train                              # tsx scripts/train-risk-model.ts (bonus 2)
pnpm docs:openapi                          # emit docs/openapi.json
```

---

## 5. Project Structure

```text
uftb/
├── pnpm-workspace.yaml           packages: [backend, frontend, packages/*]
├── package.json                  root scripts (dev/build/test/lint/db:*)
├── docker-compose.yml            postgres:18 -> host 5433
├── .env.example                  shared/root env
├── .prettierrc                   mirrors frontend config (no semi, double quotes)
├── README.md                     setup, demo script, credentials, retention policy
│
├── packages/shared/              @scsrg/shared — the wire contract
│   └── src/
│       ├── domain/               ZoneState, IncidentStatus, UserRole, ActuationType,
│       │                         SensorType, SensorStatus, ValidationStatus, HazardType
│       ├── schemas/              Zod: sensor reading, login, filters, override, report
│       ├── api/                  ApiResponse<T>, ApiError, ErrorCode, pagination meta
│       ├── realtime/             ServerToClientEvents, ClientToServerEvents, payloads
│       └── index.ts
│
├── backend/
│   ├── src/
│   │   ├── app.ts                express app assembly (no listen)
│   │   ├── server.ts             http + socket.io bootstrap, graceful shutdown
│   │   ├── config/               env.ts (Zod-parsed), risk.config.ts, priority.config.ts,
│   │   │                         sensor.config.ts, logger.ts, openapi.ts
│   │   ├── database/             prisma client singleton, transaction helpers
│   │   ├── middleware/           authentication, authorization, zone-auth, validation,
│   │   │                         rate-limit, error, request-context
│   │   ├── modules/
│   │   │   ├── auth/             login, me
│   │   │   ├── users/            admin user + role management
│   │   │   ├── zones/            CRUD, status projection, timeline, health
│   │   │   ├── sensors/          sensor config + status
│   │   │   ├── ingestion/        readings, heartbeat, command pull/complete
│   │   │   │                     ├─ validation.service.ts  (range/time/duplicate/order)
│   │   │   │                     └─ debounce.service.ts    (fire/occupancy/warm-up)
│   │   │   ├── risk-engine/      pure fusion + classification + explanation
│   │   │   ├── priority-engine/  pure deterministic ranking + explanation
│   │   │   ├── incidents/        lifecycle, timeline, filters
│   │   │   ├── acknowledgments/  concurrency-safe acknowledge
│   │   │   ├── actuation/        desired-state resolver, command dispatch, idempotency
│   │   │   ├── overrides/        admin manual overrides
│   │   │   ├── system-health/    health projection, system events
│   │   │   ├── audit/            audit log writer + reader
│   │   │   ├── dashboard/        summary aggregation
│   │   │   ├── simulator/        engine, scenarios, control API   (D2)
│   │   │   ├── trend/            bonus 1
│   │   │   ├── prediction/       bonus 2 (inference only, no actuation access)
│   │   │   └── reports/          bonus 3 (NL extraction + validation gate)
│   │   ├── realtime/             socket server, auth, rooms, emitter, event-id stamping
│   │   ├── jobs/                 heartbeat-monitor, recovery-sweeper, retention
│   │   ├── shared/               errors, result types, clock, id, pagination, guards
│   │   ├── bootstrap/            restart state reconstruction (8-step sequence)
│   │   └── tests/
│   │       ├── integration/      supertest suites (own test database)
│   │       ├── fixtures/         builders for zones/readings/incidents
│   │       └── setup.ts          global vitest setup / db lifecycle
│   ├── prisma/{schema.prisma,migrations/,seed.ts}
│   ├── scripts/                  load-generator, explain-hot-queries, backup.sh,
│   │                             train-risk-model, print-zone-keys
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
│
├── frontend/                     EXTEND ONLY
│   └── src/
│       ├── app/                  providers, router, layout shell
│       ├── components/
│       │   ├── ui/               shadcn primitives (existing + added)
│       │   ├── layout/           app-shell, sidebar-nav, top-bar, connection-badge
│       │   ├── zones/            zone-card, state-badge, sensor-readout, actuator-strip
│       │   ├── incidents/        incident-table, incident-drawer, timeline
│       │   ├── priority/         priority-queue, rank-row, ranking-explanation
│       │   ├── alerts/           critical-banner, alert-toaster, alert-dedupe
│       │   ├── charts/           risk-history-chart, sensor-history-chart (Recharts)
│       │   └── simulator/        zone-simulator-card, scenario-launcher, payload-inspector
│       ├── features/             auth, dashboard, zones, incidents, priority-queue,
│       │                         system-health, administration, simulator, audit, reports
│       ├── hooks/                use-socket, use-socket-event, use-auth, use-role,
│       │                         use-live-query-sync, use-alert-stream
│       ├── lib/                  api.ts, socket.ts, query-client.ts, query-keys.ts,
│       │                         auth-storage.ts, format.ts, utils.ts (existing)
│       ├── routes/               route table + role guards
│       ├── schemas/              form schemas (re-export @scsrg/shared where possible)
│       ├── stores/               ephemeral UI state (alert dedupe LRU, sim panel)
│       ├── types/                view-model types only
│       ├── test/                 setup.ts, msw handlers, socket test double
│       └── main.tsx              EXISTING — extended with providers
│
├── docs/
│   ├── architecture.md   api.md   database-schema.md   risk-fusion.md
│   ├── priority-ranking.md   security.md   resilience.md   demo-scenarios.md
│   ├── data-retention.md   ml-model.md   openapi.json
│   └── diagrams/         mermaid sources
│
└── specs-and-planning/   prompt.md, spec.md (this file), plan.md, tasks.md
```

**Placement rules**

- Business rules live in `*.service.ts`; controllers only parse, delegate, and shape responses.
- Database access lives in `*.repository.ts`; services never import the Prisma client directly.
- The risk engine and priority engine are **pure functions** — no I/O, no clock, no Prisma. Time and config are passed in.
- Backend unit tests are colocated (`risk-engine/risk.service.test.ts`); integration tests live in `src/tests/integration/`.
- Frontend tests are colocated (`zone-card.test.tsx`).

---

## 6. Code Style

Prettier (root `.prettierrc`, mirroring the existing frontend config): **no semicolons**, **double quotes**, 2-space indent, `printWidth: 80`, `trailingComma: "es5"`, LF. ESLint 10 flat config; `typescript-eslint` recommended plus `no-floating-promises` on the backend.

**Naming:** files `kebab-case.ts` with a role suffix (`.service`, `.controller`, `.repository`, `.routes`, `.schema`, `.types`, `.test`). Types/interfaces `PascalCase`. Functions/variables `camelCase`. Constants and enum members `SCREAMING_SNAKE_CASE`. Booleans read as predicates (`isActive`, `hasOpenIncident`). No abbreviations in domain names (`acknowledgment`, not `ack`, outside local scope).

### Backend — a pure engine (the style to copy)

```ts
// backend/src/modules/risk-engine/risk.service.ts
import type { RiskConfig } from "@/config/risk.config"
import type { ZoneState } from "@scsrg/shared"

export type RiskInputs = {
  /** 0 or 1 — already debounced by the ingestion layer. */
  fireSignal: 0 | 1
  /** 0..1 — already gated by the gas warm-up window. */
  normalizedGasLevel: number
  /** 0..1 */
  normalizedWaterLevel: number
  /** 0 or 1 — 0 when the occupancy sensor is unavailable. */
  occupancyFactor: 0 | 1
}

export type RiskResult = {
  riskScore: number
  state: ZoneState
  contributions: { fire: number; gas: number; water: number; occupancy: number }
  reasons: string[]
}

/**
 * Fuses debounced sensor signals into a 0..100 risk score.
 *
 * Pure: no clock, no I/O, no Prisma. Weights and thresholds arrive via config
 * so they can be tuned per deployment without touching this function.
 */
export function computeRisk(
  inputs: RiskInputs,
  config: RiskConfig
): RiskResult {
  const contributions = {
    fire: config.weights.fire * inputs.fireSignal,
    gas: config.weights.gas * clamp01(inputs.normalizedGasLevel),
    water: config.weights.water * clamp01(inputs.normalizedWaterLevel),
    occupancy: config.weights.occupancy * inputs.occupancyFactor,
  }

  const total = round2(
    clamp(
      contributions.fire +
        contributions.gas +
        contributions.water +
        contributions.occupancy,
      0,
      100
    )
  )

  return {
    riskScore: total,
    state: classify(total, config.thresholds),
    contributions,
    reasons: explain(inputs, contributions, config),
  }
}
```

**Backend rules**

- Named exports only; no default exports.
- Async functions return typed results; errors thrown as `AppError` subclasses carrying an `ErrorCode` and HTTP status, converted to the envelope by `error.middleware.ts`.
- Every exported service function has a JSDoc block stating what it guarantees.
- `any` is banned; `unknown` + a Zod parse at every trust boundary.
- No business logic in controllers, no Prisma calls in services, no magic numbers outside `config/`.

### Frontend — a status component (the style to copy)

```tsx
// frontend/src/components/zones/state-badge.tsx
import { AlertTriangle, CheckCircle2, HelpCircle, Siren } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ZoneState } from "@scsrg/shared"

const STATE_PRESENTATION = {
  SAFE: {
    label: "Safe",
    Icon: CheckCircle2,
    className: "border-emerald-600/40 bg-emerald-950/40 text-emerald-300",
  },
  WARNING: {
    label: "Warning",
    Icon: AlertTriangle,
    className: "border-amber-500/50 bg-amber-950/40 text-amber-300",
  },
  CRITICAL: {
    label: "Critical",
    Icon: Siren,
    className: "border-red-500/60 bg-red-950/50 text-red-300",
  },
  OFFLINE: {
    label: "Offline",
    Icon: HelpCircle,
    className: "border-zinc-600/50 bg-zinc-900/60 text-zinc-400",
  },
} as const satisfies Record<
  ZoneState,
  { label: string; Icon: typeof Siren; className: string }
>

export function StateBadge({
  state,
  className,
}: {
  state: ZoneState
  className?: string
}) {
  const { label, Icon, className: stateClassName } = STATE_PRESENTATION[state]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
        stateClassName,
        className
      )}
    >
      {/* icon + label + border weight so state never depends on colour alone */}
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}
```

**Frontend rules**

- Function components, named exports, props typed inline or as a local `Props` type.
- Server data comes from TanStack Query; sockets **invalidate or patch** the cache, never replace it as the source of truth.
- `satisfies Record<ZoneState, …>` exhaustiveness for every state map — adding a state must break the build.
- Every status signal carries **icon + text + border**, never colour alone.
- Filters live in URL search params; `useState` is only for ephemeral UI (open/closed, hover).
- No inline hex colours — Tailwind tokens or the semantic status scale defined in `docs/architecture.md`.

---

## 7. Testing Strategy

### Framework & layout

| Layer                   | Tool                                   | Location                                            |
| ----------------------- | -------------------------------------- | --------------------------------------------------- |
| Backend unit            | Vitest (node env)                      | colocated `src/modules/**/*.test.ts`                |
| Backend integration     | Vitest + Supertest                     | `src/tests/integration/*.test.ts`                   |
| Backend concurrency     | Vitest + Supertest + `Promise.all`     | `src/tests/integration/acknowledgment-race.test.ts` |
| Frontend unit/component | Vitest + jsdom + React Testing Library | colocated `*.test.tsx`                              |
| Frontend network mocks  | MSW                                    | `src/test/msw/`                                     |
| Frontend socket mocks   | in-repo fake `Socket` emitter          | `src/test/socket-double.ts`                         |

Integration tests run against a **dedicated database** (`scsrg_test` on the same container). `src/tests/setup.ts` applies migrations once, then truncates all tables between suites inside a transaction-per-test where possible. Tests never share mutable state and must pass when run in any order.

### Coverage expectations

- ≥ **90 %** lines/branches: `risk-engine`, `priority-engine`.
- ≥ **80 %**: `ingestion` (validation + debounce), `incidents`, `acknowledgments`, `actuation`.
- ≥ **60 %** overall backend. Frontend: the eight named flows below, coverage not gated.

### Required backend unit tests

Risk score arithmetic · threshold boundaries at 29/30/64/65 exactly · clamping at 0 and 100 · fire debounce confirm and clear · flicker shorter than the window produces no critical contribution · gas warm-up suppression and expiry · occupancy debounce and unavailable-sensor handling · invalid sensor values (negative, > 1, NaN, wrong type) · timestamp validation (missing, malformed, excessively future) · duplicate reading detection by `readingId` and by `(zoneId, sequenceNumber)` · out-of-order detection · priority ranking ordering · stable tie-breaking · acknowledged incidents rank below unacknowledged · incident creation on CRITICAL entry · no duplicate incident during oscillation · resolution on recovery · new incident after a resolved one re-triggers · RBAC guard matrix · offline detection at the timeout boundary · actuation desired-state resolution and idempotency.

### Required integration tests

Login success/failure · `GET /auth/me` · zone API-key auth (valid, invalid, revoked, wrong zone) · reading ingestion happy path with computed risk persisted · malformed payload → 400 · impossible values → 422 · duplicate → 409 · `GET /zones` returns every zone's current status in one request · incident date-range + zone + status + hazard filters · acknowledge success → 200 · **two concurrent acknowledgments → exactly one 200, one 409, exactly one row** · admin override success · security staff hitting an admin route → 403 · offline transition after timeout · restart reconstruction (rebuild state from a seeded mid-incident database and assert zone states, open incidents and priority queue are identical).

### Required frontend tests

Zone status rendering for all four states · priority queue ordering matches API rank · ranking explanation is visible · acknowledge interaction fires the mutation and reflects the result · role-restricted controls hidden for `SECURITY_STAFF` · socket event updates the rendered zone without a refetch loop · offline zone renders as offline (never safe) · multiple simultaneous critical alerts remain independently visible and dismissible.

### Definition of done for any task

`pnpm typecheck && pnpm lint && pnpm test` all pass, the app still runs (`pnpm dev` boots backend + frontend without error), and the task's own acceptance criteria are demonstrated.

---

## 8. Boundaries

### Always

- Validate every external input with a Zod schema from `@scsrg/shared` at the trust boundary.
- Compute risk, state, priority and incident status **on the backend only**.
- Enforce RBAC in backend middleware _and_ mirror it in the UI (backend is authoritative).
- Write an `AuditLog` row for every state-changing admin action and every acknowledgment.
- Run `pnpm typecheck && pnpm lint && pnpm test` before declaring a task complete.
- Keep the application runnable at the end of every task.
- Use migrations for schema changes (`prisma migrate dev`), never `db push` on a shared database.
- Redact `authorization`, `x-zone-api-key`, `password`, `passwordHash`, `apiKey` from all logs.
- Give every status indicator an icon and a text label in addition to colour.

### Ask first

- Adding a runtime dependency not listed in [Tech Stack](#3-tech-stack).
- Any change to the risk formula, weights, thresholds, or priority formula beyond making them configurable.
- Changing the shape of an already-implemented API response or Socket.IO event.
- Introducing a second process, queue, or cache (Redis, BullMQ, etc.).
- Destructive database operations against a non-test database (`migrate reset`, truncation).
- Modifying `frontend/components.json`, `frontend/src/index.css` design tokens, or the existing `theme-provider`.
- Deviating from the approved task order in `tasks.md`.

### Never

- Trust a client-supplied `riskScore`, `state`, `priority`, or `incidentStatus`.
- Enforce authorisation only in the frontend.
- Use in-memory arrays as the primary datastore (in-memory caches must be rebuildable from Postgres).
- Delete a zone row that has incidents — deactivate (`isActive = false`) instead.
- Create a new incident for every repeated CRITICAL reading.
- Render a disconnected sensor or offline zone as SAFE.
- Let predicted risk (bonus 2) or an AI-extracted report (bonus 3) trigger actuation or set zone state.
- Commit secrets, `.env`, or generated zone API keys.
- Reinitialise, replace, or delete the existing React/Vite/shadcn frontend setup.
- Skip, delete, or `.skip()` a failing test to make a gate pass.

---

## 9. Domain Specification

### 9.1 Zones

Seeded zones (the system must accept new zones with **no code change** — all behaviour derives from zone + sensor configuration rows):

| Code           | Name         | Sensors                 | Asset importance (0–8) | Hazard profile                                                    |
| -------------- | ------------ | ----------------------- | ---------------------- | ----------------------------------------------------------------- |
| `iot-lab`      | IoT Lab      | flame, gas, occupancy   | 5                      | Soldering/wiring fire, fumes, high occupancy                      |
| `server-room`  | Server Room  | flame, water, occupancy | 8                      | Electrical fire, condensate leak, low occupancy, high asset value |
| `robotics-lab` | Robotics Lab | flame, gas, occupancy   | 6                      | Battery off-gassing, fabrication fire, moderate occupancy         |

A sensor type absent from a zone's configuration contributes **0** to that zone's risk, and a reading that supplies it is rejected as `SENSOR_NOT_CONFIGURED` (422).

### 9.2 Ingestion pipeline (authoritative order)

```
1  Zone API key auth        (X-Zone-API-Key -> bcrypt compare vs ZoneCredential, revokedAt null)
2  Schema validation        (Zod; wrong shape -> 400 VALIDATION_ERROR)
3  Semantic validation      (ranges/timestamps/configured sensors -> 422 UNPROCESSABLE_READING)
4  Duplicate detection      (readingId unique | (zoneId, sequenceNumber) unique -> 409 DUPLICATE_READING)
5  Ordering check           (capturedAt or sequenceNumber older than latest accepted -> OUT_OF_ORDER)
6  Normalisation            (gas/water clamped to 0..1, booleans coerced, sensorHealth merged)
7  Debounce & warm-up       (fire consecutive-N, occupancy debounce, gas warm-up gate)
8  Risk fusion              (pure engine -> score, state, contributions, reasons)
9  Persist                  (SensorReading row incl. score/state/contributions/validationStatus)
10 Live-state application   (SKIPPED for out-of-order readings)
11 State transition         (only when newState !== zone.state -> ZoneStateTransition row)
12 Incident lifecycle       (open on CRITICAL entry, resolve on confirmed recovery)
13 Actuation                (desired actuator state resolved; commands only on change)
14 Priority recalculation   (when the active critical set or its inputs changed)
15 Broadcast                (zone:updated, plus any transition/incident/priority events)
16 Audit / system events     (validation failures, offline/online, duplicates)
```

Steps 9–14 execute inside **one database transaction** so a crash cannot leave a reading stored without its state transition, or an incident open without a timeline entry.

### 9.3 Zone states

```ts
type ZoneState = "SAFE" | "WARNING" | "CRITICAL" | "OFFLINE"
```

| State      | Entry condition                                                                                                                      | LED                                                                 | Buzzer    | Relay cutoff | Incident                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------- | ------------ | ---------------------------- |
| `SAFE`     | riskScore 0–29.99, all critical sensors reporting                                                                                    | GREEN                                                               | OFF       | OFF          | none                         |
| `WARNING`  | riskScore 30–64.99                                                                                                                   | YELLOW                                                              | OFF       | OFF          | none                         |
| `CRITICAL` | riskScore ≥ 65                                                                                                                       | RED                                                                 | ON        | ON           | open one                     |
| `OFFLINE`  | no accepted reading or heartbeat within `ZONE_OFFLINE_TIMEOUT_MS`, **or** any sensor marked `isCritical` (flame) reports unavailable | AMBER-PULSE (distinct from WARNING; icon + label carry the meaning) | unchanged | unchanged    | existing incidents stay open |

`OFFLINE` is never treated as `SAFE`, never silently closes an incident, always records a `ZoneStateTransition` and a `SystemEvent` (`ZONE_OFFLINE`, severity `WARN`), and always surfaces `lastSeenAt` in the UI.

**Recovery hysteresis.** Leaving `CRITICAL` requires riskScore < (65 − `STATE_HYSTERESIS`, default 5 → below 60) for `RECOVERY_CONSECUTIVE_READINGS` (default 3) consecutive accepted readings. This prevents a score oscillating around 65 from thrashing incidents and actuators.

### 9.4 Risk fusion engine

```text
riskScore = 40·fireSignal + 25·normalizedGasLevel + 20·normalizedWaterLevel + 15·occupancyFactor
```

Clamped to `[0, 100]`, rounded to 2 decimals. Weights and thresholds live in `config/risk.config.ts`, overridable by env. Classification: `0–29.99 SAFE`, `30–64.99 WARNING`, `65–100 CRITICAL`.

Stored per reading: `riskScore`, `calculatedState`, and a `contributions` JSON:

```json
{
  "riskScore": 72.5,
  "state": "CRITICAL",
  "contributions": { "fire": 40, "gas": 17.5, "water": 0, "occupancy": 15 },
  "reasons": [
    "Sustained flame confirmed after debounce (5 consecutive readings)",
    "Gas level is 70% of configured range",
    "Zone is currently occupied"
  ]
}
```

Reason strings are generated by a pure `explain()` function with one rule per contributing signal, so the UI never has to reconstruct _why_.

**Weight justification** (documented in `docs/risk-fusion.md`): fire is the only signal that alone crosses into WARNING territory and, combined with any second hazard, reaches CRITICAL — matching a confirmed-flame response policy. Gas at 100 % plus occupancy (40) stays WARNING because a saturated gas reading without flame is an evacuate-and-ventilate event, not a cutoff event; gas 100 % + fire = 65 = CRITICAL exactly at the boundary. Occupancy alone (15) never leaves SAFE — people are a severity multiplier, not a hazard.

### 9.5 Sensor processing rules

**Fire debounce.** `fireSignal` becomes 1 only after `FIRE_DEBOUNCE_CONSECUTIVE` (default 5) consecutive readings with `fireDetected: true`. At the default demo interval this is ≈1 s. A flicker shorter than the window contributes 0. `fireSignal` returns to 0 only after `FIRE_CLEAR_CONSECUTIVE` (default 5) consecutive `false` readings — asymmetric hysteresis, so a momentary sensor dropout during a real fire does not clear the alarm. Debounce counters are held per zone in a rebuildable in-memory map, reconstructed at startup from the last N stored readings.

**Gas.** Accepts `0.0–1.0`; anything outside → 422 `VALUE_OUT_OF_RANGE`. A configurable warm-up (`GAS_WARMUP_MS`, 30 000 prod / 5 000 demo) starts when a zone's gas sensor first reports after boot or reconnection. During warm-up the gas contribution is forced to 0, the sensor status is `WARMING_UP`, and gas can raise neither state nor an incident. The suppression is recorded in the reading's `reasons`.

**Water level.** Accepts `0.0–1.0`; negative or > 1 → 422. Supports gradual rise; derived phase (`DRY < 0.15`, `RISING 0.15–0.59`, `CRITICAL ≥ 0.6`, `RESET` on return below 0.1) is shown in the UI and included in dominant-hazard computation.

**Occupancy.** Boolean, debounced over `OCCUPANCY_DEBOUNCE_READINGS` (default 3) to stop event spam. If the occupancy sensor reports unavailable, the sensor status becomes `UNAVAILABLE` — **never** `occupancy: false`. Risk contribution for unknown occupancy is 0 (the system does not fabricate hazard), but the **priority engine treats unknown occupancy as occupied** so responder dispatch fails safe. Both behaviours are stated in the reading's reasons and in `docs/risk-fusion.md`.

### 9.6 Priority ranking engine

Separate from risk. Answers _"which critical zone first?"_, computed over **active (OPEN or ACKNOWLEDGED) incidents** only.

```text
priorityScore = riskScore
              + occupancyBonus         (10 when occupied or occupancy unknown)
              + criticalDurationBonus  (min(10, floor(criticalSeconds / 6)))
              + assetImportanceBonus   (zone.assetImportance, 0–8)
              + multiHazardBonus       (5 when ≥2 hazard signals are active)
              + acknowledgedPenalty    (−15 when status = ACKNOWLEDGED)
```

**Determinism.** Ranking sorts by `priorityScore DESC`, then `riskScore DESC`, then `startedAt ASC`, then `incidentId ASC`. That chain is total, so identical inputs always produce an identical ordering. Recalculated whenever an incident opens, is acknowledged, resolves, or has its risk score updated — and on boot.

Each ranked entry carries a human-readable explanation:

```json
{
  "rank": 1,
  "incidentId": "...",
  "zoneName": "IoT Lab",
  "riskScore": 84,
  "priorityScore": 101,
  "breakdown": {
    "risk": 84,
    "occupancy": 10,
    "duration": 2,
    "asset": 5,
    "multiHazard": 5,
    "acknowledged": 0
  },
  "reasons": [
    "Highest live risk score (84)",
    "Zone is occupied (+10)",
    "Confirmed fire and gas hazards (+5)",
    "Critical for 48 seconds (+2)",
    "High-value zone, asset importance 5 (+5)"
  ]
}
```

The dashboard must render enough of this to make _why rank 1 beats rank 2_ legible without opening a detail view.

### 9.7 Incident lifecycle

```ts
type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED"
```

```
Zone enters CRITICAL ──▶ OPEN ──(security acknowledges)──▶ ACKNOWLEDGED
                          │                                     │
                          └────────(zone recovers, hysteresis met)────▶ RESOLVED
```

- **At most one active incident per zone**, enforced by a partial unique index: `UNIQUE (zoneId) WHERE status IN ('OPEN','ACKNOWLEDGED')`. Rapid oscillation therefore cannot create duplicates even under concurrent ingestion.
- A `RESOLVED` incident followed by a new CRITICAL entry creates a **new** incident.
- Recorded per incident: `startedAt`, `acknowledgedAt` + user, `resolvedAt`, `maximumRiskScore` (monotonic high-water mark), `currentRiskScore`, `dominantHazards[]`, `priorityScore`, `priorityExplanation`, and a full `IncidentTimelineEvent` chain (`CREATED`, `RISK_UPDATED`, `STATE_CHANGED`, `ACKNOWLEDGED`, `ACTUATION_ISSUED`, `OVERRIDE_APPLIED`, `ZONE_OFFLINE`, `RESOLVED`).
- Resolution requires the recovery hysteresis in §9.3. A zone going `OFFLINE` **does not** resolve its incident.

### 9.8 Acknowledgment concurrency

Two officers may click Acknowledge at the same millisecond. Guaranteed outcome: **exactly one wins.**

Implementation — belt and braces, both database-enforced:

1. `Acknowledgment` has `UNIQUE (incidentId)`.
2. Inside a transaction, a conditional update: `UPDATE "Incident" SET status='ACKNOWLEDGED', "acknowledgedAt"=now() WHERE id=$1 AND status='OPEN'`. If it affects 0 rows, the transaction aborts with `409 ALREADY_ACKNOWLEDGED`.

Expected behaviour: first request `200`, second `409 Conflict`, exactly one `Acknowledgment` row, winner's `userId` and timestamp preserved, one `AuditLog` entry, one `incident:acknowledged` broadcast. Frontend button disabling is a UX nicety, never the mechanism. Covered by `acknowledgment-race.test.ts` firing N=10 concurrent requests and asserting 1 success / 9 conflicts / 1 row.

### 9.9 Out-of-order readings

A reading whose `capturedAt` precedes the latest accepted reading's `capturedAt` (or whose `sequenceNumber` is lower) is: **stored** with `validationStatus = ACCEPTED_OUT_OF_ORDER` and its computed risk retained for audit; **not** applied to live zone state; **not** allowed to create a `ZoneStateTransition`, an incident, or an actuation command; surfaced in raw history flagged as out of order. The incident timeline is never reordered by it.

### 9.10 Offline detection & reconnection

A `jobs/heartbeat-monitor` sweeps every `ZONE_OFFLINE_SWEEP_MS` (2 000) and marks any active zone whose `lastSeenAt` is older than `ZONE_OFFLINE_TIMEOUT_MS` (10 000) as `OFFLINE`: transition recorded, `sensor:offline` + `zone:state-changed` broadcast, `SystemEvent` written, `lastSeenAt` displayed. Active incidents remain open.

On reconnection the zone re-authenticates, its readings are accepted, `lastSeenAt` updates, state is recomputed from the first accepted reading (not assumed SAFE), gas warm-up restarts, and any backlog the node replays is processed through the same duplicate/ordering rules.

### 9.11 Backend restart recovery

`bootstrap/` runs on startup, before the HTTP listener binds:

1. Connect to Postgres (fail fast, exit non-zero on failure).
2. Load all active zones.
3. Load each zone's latest accepted reading + the last N readings needed to rehydrate debounce counters.
4. Load `OPEN` and `ACKNOWLEDGED` incidents.
5. Reconstruct current zone states — including re-deriving `OFFLINE` from `lastSeenAt` versus wall clock.
6. Recalculate the priority queue.
7. Start heartbeat monitoring and the recovery sweeper.
8. Bind HTTP + Socket.IO and begin accepting connections.

The backend never assumes zones are SAFE after restart. Verified by an integration test that seeds a mid-incident database, boots the app, and asserts states, incidents and queue match pre-restart values.

### 9.12 Actuation model

```ts
type ActuationType =
  | "SET_LED"
  | "ACTIVATE_BUZZER"
  | "DEACTIVATE_BUZZER"
  | "ACTIVATE_RELAY"
  | "DEACTIVATE_RELAY"
```

Desired actuator state is a **pure function of zone state** (table in §9.3). A resolver diffs desired versus last-known actuator state per zone and emits commands **only on change** — so a zone sitting in CRITICAL for a minute produces one buzzer command, not three hundred. Each `ActuationCommand` records `source` (`SENSOR_TRIGGERED` | `MANUAL_OVERRIDE` | `SYSTEM_RECOVERY`), `status` (`PENDING` → `DISPATCHED` → `COMPLETED` | `FAILED` | `EXPIRED`), `requestedAt`, `executedAt`, and its originating `incidentId` where applicable. Zones actuate independently — commands are keyed per zone and two simultaneous critical zones never share state. CRITICAL commands are created inside the ingestion transaction, so the request→command latency is milliseconds and provably < 1 s.

### 9.13 RBAC

```ts
type UserRole = "SECURITY_STAFF" | "ADMIN"
```

| Capability                                              | SECURITY_STAFF | ADMIN |
| ------------------------------------------------------- | -------------- | ----- |
| Log in, view profile                                    | ✅             | ✅    |
| View zones, priority queue, incidents, incident history | ✅             | ✅    |
| Acknowledge incidents                                   | ✅             | ✅    |
| Submit natural-language report (bonus 3)                | ✅             | ✅    |
| Manual overrides                                        | ❌ 403         | ✅    |
| System health page/API                                  | ❌ 403         | ✅    |
| Create/edit zones & sensors                             | ❌ 403         | ✅    |
| Raw historical readings                                 | ❌ 403         | ✅    |
| Manage users / roles                                    | ❌ 403         | ✅    |
| Audit logs                                              | ❌ 403         | ✅    |

Enforced by `authorization.middleware.ts` on every admin route. A direct API call from a `SECURITY_STAFF` token must return `403` even though the frontend hides the button — asserted by integration tests for every admin endpoint. Sensor nodes authenticate separately with `X-Zone-API-Key` (bcrypt-hashed at rest, plaintext only at seed time) and can reach **only** `/ingestion/*`.

### 9.14 Manual overrides (admin)

Actions: `FORCE_MAINTENANCE_MODE`, `CLEAR_MAINTENANCE_MODE`, `TEST_ACTUATION`, `SILENCE_BUZZER`, `RESET_ACTUATION`, `MARK_SENSOR_MAINTENANCE`, `CLEAR_SENSOR_MAINTENANCE`. Every override is Zod-validated, admin-gated, requires a `reason` string (min 5 chars), writes a `ManualOverride` row **and** an `AuditLog` row with user/timestamp/action/zone/metadata, routes through the same idempotent actuation resolver (no duplicate physical responses), and produces commands tagged `source: MANUAL_OVERRIDE` so the UI distinguishes them from sensor-triggered actions. A zone in maintenance mode still ingests and stores readings but suppresses incident creation and actuation — clearly labelled in the UI.

---

## 10. Data Model

Normalised PostgreSQL schema via Prisma. Full ERD in `docs/database-schema.md`.

| Model                        | Purpose                          | Key constraints                                                        |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `User`                       | Dashboard accounts               | `UNIQUE(email)`; `passwordHash` bcrypt cost 12                         |
| `Zone`                       | Monitored area + live projection | `UNIQUE(code)`; `assetImportance` 0–8; soft-delete via `isActive`      |
| `ZoneCredential`             | Per-zone API key                 | `apiKeyHash` bcrypt; `revokedAt` nullable; index `(zoneId, revokedAt)` |
| `Sensor`                     | Per-zone sensor config           | `UNIQUE(zoneId, type)`; `isCritical` flag; `configuration` JSON        |
| `SensorReading`              | Immutable raw + computed record  | `UNIQUE(readingId)`, `UNIQUE(zoneId, sequenceNumber)`, FK → Zone       |
| `ZoneStateTransition`        | State change audit               | FK → Zone; index `(zoneId, createdAt)`                                 |
| `Incident`                   | Hazard event                     | **partial `UNIQUE(zoneId) WHERE status IN ('OPEN','ACKNOWLEDGED')`**   |
| `Acknowledgment`             | Who acknowledged                 | `UNIQUE(incidentId)`; FKs → Incident, User                             |
| `IncidentTimelineEvent`      | Ordered narrative                | FK → Incident; index `(incidentId, createdAt)`                         |
| `ActuationCommand`           | LED/buzzer/relay command log     | FKs → Zone, Incident?; index `(zoneId, requestedAt)`, `(status)`       |
| `ManualOverride`             | Admin action record              | FKs → Zone, User                                                       |
| `AuditLog`                   | Security-relevant actions        | index `(userId, createdAt)`, `(entityType, entityId)`                  |
| `SystemEvent`                | Health/validation/offline events | index `(createdAt)`, `(type, severity)`                                |
| `IncidentReport` _(bonus 3)_ | NL report + extraction result    | FKs → User, Zone?; `status` PENDING/CONFIRMED/REJECTED                 |

**Referential integrity.** Zones are never hard-deleted while incidents reference them — `onDelete: Restrict` on `Incident.zoneId` and `SensorReading.zoneId`, with deactivation (`isActive = false`) as the supported path. An integration test asserts the delete attempt fails.

**`isDuplicate` semantics.** Exact duplicates (same `readingId`, or same `(zoneId, sequenceNumber)`) are rejected at the unique constraint with `409` and logged as a `SystemEvent` — they never create a second row, so a duplicate can never be counted twice. The `isDuplicate` column marks an _accepted_ reading whose sensor payload was byte-identical to the immediately preceding accepted reading for that zone; it is a real signal ("nothing changed") used to suppress redundant timeline noise.

### Required indexes

`Incident(status, createdAt)` · `Incident(zoneId, startedAt)` · `SensorReading(zoneId, capturedAt DESC)` · `SensorReading(readingId)` · `SensorReading(zoneId, sequenceNumber)` · `Zone(state)` · `Zone(lastSeenAt)` · `IncidentTimelineEvent(incidentId, createdAt)` · `ZoneStateTransition(zoneId, createdAt)` · `ActuationCommand(zoneId, requestedAt)` · `SystemEvent(createdAt)`.

**Performance gate.** With ≥ 10 000 seeded readings and ≥ 200 incidents, the query _"all CRITICAL or active incidents from the last 24 hours across all zones"_ must complete in **< 50 ms** and use `Incident(status, createdAt)` — verified by `pnpm db:explain`, which fails the build on a sequential scan.

### Seed data

Users (**development-only credentials, stated as such in README and seed output**): `admin@scsrg.local` / `Admin123!` (ADMIN), `security@scsrg.local` / `Security123!` (SECURITY_STAFF).

Also seeded: 3 zones with sensors and API credentials; ≥ 10 000 historical readings spread over 7 days; ≥ 5 resolved incidents with full timelines; exactly 1 acknowledged incident; sample audit logs and system events. Generated zone API keys are printed **once** during development seeding and written to `backend/.dev-zone-keys.json` (gitignored) plus `backend/.env.simulator`. Hashes are never presented as usable credentials.

---

## 11. API Contract

Base path `/api/v1`. Every response uses the envelope:

```json
{ "success": true, "data": {}, "meta": {} }
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The sensor payload is invalid.",
    "details": []
  }
}
```

**Status codes:** `200` ok · `201` created · `400` malformed input · `401` unauthenticated · `403` unauthorised · `404` not found · `409` conflict (duplicate reading, already acknowledged) · `422` valid shape but impossible values · `429` rate limited · `500` unexpected.

**Error codes:** `VALIDATION_ERROR`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `NOT_FOUND`, `DUPLICATE_READING`, `ALREADY_ACKNOWLEDGED`, `VALUE_OUT_OF_RANGE`, `SENSOR_NOT_CONFIGURED`, `INVALID_TIMESTAMP`, `ZONE_INACTIVE`, `INVALID_ZONE_KEY`, `RATE_LIMITED`, `INTERNAL_ERROR`.

| Method & path                                                                                                                                                    | Auth                      | Notes                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `POST /auth/login`                                                                                                                                               | public                    | Rate-limited 5/min/IP. Returns token + user.                                          |
| `GET /auth/me`                                                                                                                                                   | JWT                       | Current user + role.                                                                  |
| `GET /zones`                                                                                                                                                     | JWT                       | **All** current zone statuses in one request.                                         |
| `GET /zones/:zoneId`                                                                                                                                             | JWT                       | Detail incl. contributions, sensor health, actuator state, config.                    |
| `GET /zones/:zoneId/readings`                                                                                                                                    | JWT (raw history = ADMIN) | Paginated, date-filterable.                                                           |
| `GET /zones/:zoneId/timeline`                                                                                                                                    | JWT                       | State transitions + incidents merged.                                                 |
| `GET /zones/:zoneId/system-health`                                                                                                                               | ADMIN                     | Sensor connectivity, last reading, failures.                                          |
| `POST /ingestion/zones/:zoneId/readings`                                                                                                                         | Zone API key              | The pipeline in §9.2.                                                                 |
| `POST /ingestion/zones/:zoneId/heartbeat`                                                                                                                        | Zone API key              | Updates `lastSeenAt` without a reading.                                               |
| `GET /ingestion/zones/:zoneId/commands`                                                                                                                          | Zone API key              | Pending actuation commands.                                                           |
| `POST /ingestion/zones/:zoneId/commands/:commandId/complete`                                                                                                     | Zone API key              | Marks `COMPLETED`/`FAILED`.                                                           |
| `GET /incidents`                                                                                                                                                 | JWT                       | Filters: `from`, `to`, `zoneId`, `status`, `hazardType`, `acknowledgedBy`; paginated. |
| `GET /incidents/:incidentId`                                                                                                                                     | JWT                       | `404` on unknown id.                                                                  |
| `GET /incidents/:incidentId/timeline`                                                                                                                            | JWT                       | Ordered events.                                                                       |
| `POST /incidents/:incidentId/acknowledge`                                                                                                                        | JWT                       | `200` / `409` per §9.8. Optional `note`.                                              |
| `GET /priority-queue`                                                                                                                                            | JWT                       | Rank, incident, zone, risk, priority, occupancy, critical duration, explanation.      |
| `GET /dashboard/summary`                                                                                                                                         | JWT                       | Totals per state, active/unacknowledged counts, top incident, health summary.         |
| `POST /admin/zones` · `PATCH /admin/zones/:zoneId` · `PATCH /admin/sensors/:sensorId`                                                                            | ADMIN                     | Config management.                                                                    |
| `POST /admin/zones/:zoneId/overrides`                                                                                                                            | ADMIN                     | §9.14.                                                                                |
| `GET /admin/system-health`                                                                                                                                       | ADMIN                     | §13 System Health page data.                                                          |
| `GET /admin/audit-logs`                                                                                                                                          | ADMIN                     | Paginated, filterable.                                                                |
| `GET /admin/users` · `PATCH /admin/users/:userId/role`                                                                                                           | ADMIN                     | Role management.                                                                      |
| `POST /simulator/zones/:zoneId/start` · `/stop` · `PATCH /simulator/zones/:zoneId/state` · `POST /simulator/scenarios/:scenarioId/run` · `GET /simulator/status` | ADMIN                     | §14.                                                                                  |
| `POST /reports/natural-language` · `POST /reports/:reportId/confirm`                                                                                             | JWT / confirm = ADMIN     | Bonus 3, §15.3.                                                                       |
| `GET /health` · `GET /health/ready`                                                                                                                              | public                    | Liveness/readiness, no sensitive data.                                                |

Swagger UI at `/api/v1/docs`, generated from the shared Zod schemas, with example request/response bodies for every endpoint.

---

## 12. Real-Time Contract

Socket.IO, JWT-authenticated in the handshake (`auth.token`), rejected connections close with `UNAUTHENTICATED`. Rooms: `dashboard` (all authenticated clients) and `zone:<zoneId>` (detail views). Admin-only payloads are emitted to an `admin` room.

Server → client events: `zone:updated` · `zone:state-changed` · `incident:created` · `incident:updated` · `incident:acknowledged` · `incident:resolved` · `priority:updated` · `sensor:offline` · `system:health` · `actuation:command` · `simulator:payload` · `simulator:response` · `report:created` _(bonus 3)_ · `trend:updated` _(bonus 1)_ · `prediction:updated` _(bonus 2)_.

Every payload carries `{ eventId: string, emittedAt: string, ...data }`.

**Rules the implementation must honour**

- Sockets are **never the only source of truth.** On connect and on every reconnect the dashboard refetches `/dashboard/summary`, `/zones`, `/incidents?status=active`, `/priority-queue`.
- Live events patch or invalidate the TanStack Query cache; they never write to a parallel store that the UI reads instead.
- **Notification de-duplication:** the client keeps a bounded LRU of the last 200 `eventId`s and drops repeats. Additionally, toasts are suppressed for events whose `emittedAt` predates the current connection's established time, so a reconnect replaying recent history cannot re-alarm the room.
- Reconnect uses exponential backoff; the top bar shows `LIVE` / `RECONNECTING` / `OFFLINE` with icon + text.

---

## 13. Frontend Specification

Desktop-first, responsive, light and dark supported with the **command-centre view optimised for dark**. Uses the existing shadcn/ui v4 (`base-maia`) setup and existing theme tokens. Status palette: emerald = SAFE, amber = WARNING, red = CRITICAL, zinc = OFFLINE — **always paired with an icon, a text label and a distinct border weight** so no meaning depends on colour.

**Navigation** (admin-only items hidden for `SECURITY_STAFF`, and their routes still guarded): Live Command Center · Incident History · Zone Details · System Health _(admin)_ · Administration _(admin)_ · Simulator _(admin)_ · Audit Logs _(admin)_ · User Profile.

### Command Center (`/`) — the primary page

The most urgent incident must be identifiable in ≈2 seconds.

- **Top summary bar** — current time, connected zones, active incidents, unacknowledged alerts, offline zones, WebSocket connection state.
- **Critical alert banner** — appears when ≥1 unacknowledged critical incident exists; shows the highest-priority zone, its risk score and leading hazard, and an Acknowledge action; uses icon + heavy border + text, not colour alone.
- **Live zone grid** — one card per zone showing: name · state label + icon · risk score · fire signal · gas level · water level · occupancy · last update · active incident · simulated LED/buzzer/relay · a one-line reason for the current state.
- **Priority queue** — ordered active critical incidents with rank, zone, risk score, priority score, occupancy, critical duration, main hazard, acknowledgment status and the ranking explanation. **The page must visibly explain why rank 1 outranks rank 2** (breakdown chips + reason lines).
- **Live event feed** — reading accepted, WARNING entered, CRITICAL entered, incident created, incident acknowledged, zone offline, relay activated, incident resolved.
- **Active incident panel** — details, zone status, hazard breakdown, timeline, Acknowledge button, operator note field, admin override controls when authorised.

### Alert UX

First entry into CRITICAL: prominent banner **+** a stacked toast (sonner) **+** optional short alert sound (user-toggleable, default off so a demo room isn't ambushed) **+** the incident appears in the priority queue. Simultaneous alerts stack and none is lost or overwritten. On acknowledgment the repeating attention cue stops, the incident is marked acknowledged and stays visible until resolved. Reconnects never re-fire alerts (§12).

### Incident History (`/incidents`)

Filterable, searchable table — filters (date range, zone, status, hazard type, acknowledged by) live in URL search params. Columns: incident ID, zone, main hazard, maximum risk, started, acknowledged, resolved, duration, acknowledged by, status. Selecting a row opens a drawer with the complete timeline, risk-score progression (Recharts), sensor readings around the incident, actuation events, acknowledgment details and resolution details.

### Zone Detail (`/zones/:zoneId`)

Current state · current risk score · risk contributions (stacked bar) · sensor health · last-seen · active incident · latest readings table · historical risk chart (Recharts) · state-transition history · actuation state · zone configuration · asset importance.

### System Health (`/system-health`, admin)

Backend status · database connectivity · Socket.IO connection count · zone connectivity · sensor connectivity · last reading per zone · offline zones · failed actuation commands · recent validation failures · recent system events.

### Administration (`/admin`, admin) & Audit Logs (`/admin/audit-logs`, admin)

Zone and sensor management forms (React Hook Form + Zod), user role management, override console with mandatory reason; audit log table with filters and pagination.

### State management rules

TanStack Query owns all server data (typed query keys in `lib/query-keys.ts`). Socket events invalidate or patch that cache. URL search params own filters. `useState` is limited to ephemeral UI. On connect/reconnect the four snapshot queries in §12 are refetched.

---

## 14. Simulator Specification

Per **D2**: the engine lives in `backend/src/modules/simulator/`, holds zone API keys server-side, and drives the real ingestion API over HTTP. The frontend Simulator page is a control surface only and **never mutates dashboard state directly** — everything it shows arrives back through the normal API/Socket path.

```
Browser (Simulator page, admin JWT)
   │  POST /api/v1/simulator/zones/:zoneId/start
   ▼
Backend simulator engine ── holds zone API keys
   │  POST /api/v1/ingestion/zones/:zoneId/readings   (X-Zone-API-Key)
   ▼
Ingestion pipeline → risk engine → incidents → actuation → broadcast
   │  socket: simulator:payload / simulator:response  +  normal domain events
   ▼
Browser renders raw payload, backend response, and the resulting live state
```

**Per-zone controls:** fire on/off · gas level slider · water-level slider · occupancy on/off · sensor disconnection · zone network disconnection · warm-up mode · reading interval · start/stop streaming · send malformed payload · send duplicate reading · send out-of-order reading · trigger quick SAFE→WARNING→CRITICAL→SAFE cycle.

**Per-zone display:** latest submitted raw payload (pretty-printed JSON) · backend response incl. status code · zone API authentication status · simulated LED, buzzer and relay state.

### Demonstration scenarios (one click each)

| #   | Scenario                 | Demonstrates                                                                                        |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | Normal idle              | All zones SAFE, no incidents, no actuation                                                          |
| 2   | Fire debounce            | Flicker → no incident; sustained → CRITICAL; cleared → recovery to SAFE                             |
| 3   | Rising gas               | Proportional contribution, SAFE → WARNING → CRITICAL                                                |
| 4   | Server room water leak   | Rising water → WARNING → CRITICAL                                                                   |
| 5   | Simultaneous multi-zone  | Two zones critical seconds apart; both scored; queue ranks and explains; independent actuation      |
| 6   | Acknowledgment race      | Two concurrent acknowledgments; one `200`, one `409`                                                |
| 7   | Sensor offline           | Zone/sensor shows OFFLINE, never SAFE or empty                                                      |
| 8   | Dashboard reconnection   | Socket dropped, incident raised, reconnect catches up with no duplicate alerts                      |
| 9   | Invalid sensor value     | Negative water / gas > 1 rejected with 422; no risk computed from bad data                          |
| 10  | Backend restart recovery | Active incident persists; state and queue rebuilt from Postgres                                     |
| 11  | Load handling            | ≥ 30 simulated zones / high-frequency readings; responsive; no lost or duplicated accepted readings |

Scenarios are declarative step lists (`{ atMs, zoneCode, patch }`) in `simulator/scenarios/`, runnable from the UI **and** headlessly via `pnpm sim:scenario -- --id N` so they can be asserted in tests.

---

## 15. Bonus Feature Specification

All three are in scope (**D3**) and are implemented only after every core acceptance criterion in §18 passes.

### 15.1 Bonus 1 — Short-term risk trend

Over the last `TREND_WINDOW_READINGS` (default 20) accepted readings per zone, compute a moving average and a least-squares slope. Classify as `STABLE` · `RISING` · `FALLING` · `TRENDING_CRITICAL` (rising and projected to cross 65 within `TREND_HORIZON_S`, default 60). Persisted on `Zone` (`trend`, `trendSlope`, `trendUpdatedAt`), broadcast as `trend:updated`, rendered as a sparkline + arrow **clearly separated from current state**. Trend never affects state, incidents, priority or actuation. Unit tests cover flat, rising, falling and noisy series.

### 15.2 Bonus 2 — ML predicted risk

A separate `modules/prediction/` module predicting _P(zone reaches CRITICAL within the next 60 s)_.

- **Model:** logistic regression on engineered features (current risk, fire streak length, gas slope, water slope, occupancy, seconds since last transition, zone asset importance).
- **Training data:** synthetic sequences generated by `scripts/train-risk-model.ts`, **explicitly documented as synthetic** in `docs/ml-model.md`.
- **Runtime:** coefficients exported to `prediction/model.json`; inference is pure TypeScript — no Python or external service at runtime.
- **Reporting:** accuracy, precision, recall, F1 and AUC on a held-out split, plus a confusion matrix, written into `docs/ml-model.md`.
- **Hard safety boundary:** the prediction module has **no import path to the actuation or incident services**, enforced by an architecture test asserting no actuation command is ever created with `source` originating from prediction. Predicted risk is rendered in a visually distinct panel with a `PREDICTED` badge and can never set state, open an incident, or drive a buzzer or relay.

### 15.3 Bonus 3 — Natural-language incident report

`POST /reports/natural-language` accepts free text (e.g. _"Smell of gas near the IoT Lab bench, not sure how bad."_) and returns `{ zone, hazardType, estimatedSeverity, confidence, confirmationMessage }`.

- **Default extractor is deterministic** (`AI_PROVIDER=none`): zone-alias matching against the zone table, hazard keyword lexicon, severity/hedging lexicon → severity 1–5 with a confidence score. No paid service is ever required.
- An LLM provider is opt-in via `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`; its output passes through **exactly the same** Zod schema + zone-existence + severity-clamp validation gate as the deterministic path.
- Output is stored as an `IncidentReport` with `status = PENDING`. It **cannot** influence priority until a human confirms it (`POST /reports/:reportId/confirm`, ADMIN), after which it contributes a bounded `humanReportBonus` (max +5) to the priority score of the matching zone's active incident.
- AI output can **never** create an incident, set zone state, or trigger actuation. Asserted by test.

---

## 16. Non-Functional Requirements

| Requirement                          | Target                                                                                                                           | Verification                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| CRITICAL → actuation command created | < 1 000 ms from reading receipt                                                                                                  | Integration test asserts `requestedAt − receivedAt < 1000`      |
| Dashboard reflects a state change    | < 1 s after the reading is accepted                                                                                              | Manual demo check + socket emit timing log                      |
| 24h critical/active incident query   | < 50 ms with ≥ 10 000 readings                                                                                                   | `pnpm db:explain` fails on seq scan or > 50 ms                  |
| Load handling                        | ≥ 30 zones @ ≥ 5 readings/s sustained, zero lost or duplicated accepted readings                                                 | `pnpm sim:load` + a reconciliation assertion on accepted counts |
| Backend restart                      | Full state + priority queue reconstructed                                                                                        | Restart integration test                                        |
| Accessibility                        | No state conveyed by colour alone; keyboard-reachable acknowledge; visible focus rings; AA contrast in dark mode                 | Component tests + manual audit checklist                        |
| Security                             | Helmet, CORS allowlist, 1 MB body limit, per-route rate limits, redacted logs, bcrypt cost 12, no secrets to the client          | `docs/security.md` checklist + tests                            |
| Data retention                       | Raw readings 90 days, then hourly aggregates; incidents retained longer; daily `pg_dump`; documented recovery + data-loss window | `docs/data-retention.md` + `scripts/backup.sh`                  |

---

## 17. Configuration Reference

`backend/.env.example` (all parsed and validated by `config/env.ts` at boot — the process refuses to start on an invalid value):

```bash
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://scsrg:scsrg@localhost:5433/scsrg?schema=public
JWT_SECRET=change-me-in-production-min-32-chars
JWT_EXPIRES_IN=60m
BCRYPT_ROUNDS=12
CORS_ORIGINS=http://localhost:5173
LOG_LEVEL=debug

# Risk fusion
RISK_WEIGHT_FIRE=40
RISK_WEIGHT_GAS=25
RISK_WEIGHT_WATER=20
RISK_WEIGHT_OCCUPANCY=15
RISK_THRESHOLD_WARNING=30
RISK_THRESHOLD_CRITICAL=65
STATE_HYSTERESIS=5
RECOVERY_CONSECUTIVE_READINGS=3

# Sensor processing
FIRE_DEBOUNCE_CONSECUTIVE=5
FIRE_CLEAR_CONSECUTIVE=5
GAS_WARMUP_MS=5000            # 30000 in production
OCCUPANCY_DEBOUNCE_READINGS=3
MAX_FUTURE_TIMESTAMP_SKEW_MS=5000

# Offline detection
ZONE_OFFLINE_TIMEOUT_MS=10000
ZONE_OFFLINE_SWEEP_MS=2000

# Priority ranking
PRIORITY_OCCUPANCY_BONUS=10
PRIORITY_DURATION_BONUS_MAX=10
PRIORITY_MULTI_HAZARD_BONUS=5
PRIORITY_ACKNOWLEDGED_PENALTY=15
PRIORITY_HUMAN_REPORT_BONUS_MAX=5

# Simulator
SIM_DEFAULT_INTERVAL_MS=500
SIM_MAX_ZONES=40
SIM_INGESTION_BASE_URL=http://localhost:4000/api/v1

# Rate limits
RATE_LIMIT_AUTH_PER_MIN=5
RATE_LIMIT_API_PER_MIN=300
RATE_LIMIT_INGESTION_PER_MIN=1200

# Bonuses
TREND_WINDOW_READINGS=20
TREND_HORIZON_S=60
PREDICTION_ENABLED=true
AI_PROVIDER=none               # none | anthropic
# ANTHROPIC_API_KEY=
```

`frontend/.env.example`:

```bash
VITE_API_BASE_URL=/api/v1
VITE_SOCKET_URL=
VITE_ALERT_SOUND_ENABLED=false
```

---

## 18. Success Criteria

Each maps to a verification. The build is **not** done until all 30 pass.

| #   | Criterion                                         | Verified by                                                      |
| --- | ------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | ≥ 3 zones monitored                               | Seed + `GET /zones` integration test                             |
| 2   | Zones submit raw readings, never state            | Ingestion schema rejects `riskScore`/`state` keys — unit test    |
| 3   | Backend validates and computes risk               | Ingestion integration test asserts persisted score/state         |
| 4   | Fire debounce prevents brief false triggers       | Unit test: 4 positives → no critical contribution; 5 → confirmed |
| 5   | Gas and water contribute proportionally           | Unit tests across 0.0/0.25/0.5/0.75/1.0                          |
| 6   | Gas warm-up prevents false alerts                 | Unit + scenario test during warm-up window                       |
| 7   | Correct transitions among all four states         | State-machine unit tests + scenarios 2/3/4/7                     |
| 8   | CRITICAL generates independent actuation commands | Integration test: two zones, disjoint command sets               |
| 9   | Multiple zones critical simultaneously            | Scenario 5 integration test                                      |
| 10  | Priority queue ranks deterministically            | Unit test: shuffled inputs → identical ordering; tie-break test  |
| 11  | Dashboard explains the ranking                    | Frontend test asserts breakdown + reasons rendered               |
| 12  | Real-time dashboard updates                       | Frontend socket test + manual demo                               |
| 13  | Multiple alerts independently visible             | Frontend stacked-alert test                                      |
| 14  | Acknowledgment concurrency-safe                   | 10-way concurrent race test: 1×200, 9×409, 1 row                 |
| 15  | RBAC enforced by the backend                      | 403 test for every admin route with a staff token                |
| 16  | Incident history date filtering                   | Integration test on `from`/`to`                                  |
| 17  | Complete incident timeline                        | Integration test asserts the full event chain                    |
| 18  | Duplicates not counted twice                      | 409 + row-count test                                             |
| 19  | Impossible readings rejected                      | 422 tests for negative and > 1 values                            |
| 20  | Out-of-order readings don't corrupt live state    | Integration test: stale reading stored, live state unchanged     |
| 21  | Dashboard reconnects to correct state             | Scenario 8 + frontend refetch-on-reconnect test                  |
| 22  | Backend reconstructs state after restart          | Restart integration test                                         |
| 23  | Offline sensors never shown as SAFE               | Scenario 7 + frontend test                                       |
| 24  | Normalised related tables                         | Schema review + `docs/database-schema.md` ERD                    |
| 25  | Referential integrity blocks unsafe deletion      | Integration test asserting the delete fails                      |
| 26  | Indexed incident queries stay fast                | `pnpm db:explain` gate (< 50 ms, index scan)                     |
| 27  | Simulator scenarios demonstrate edge cases        | All 11 runnable from UI and headlessly                           |
| 28  | Frontend, backend and DB agree on zone state      | Cross-check assertion at the end of each scenario run            |
| 29  | Swagger documentation available                   | `/api/v1/docs` renders every endpoint with examples              |
| 30  | README lets another developer run everything      | Clean-clone walkthrough following only the README                |

Plus bonus criteria: risk trend classified and displayed separately from state · ML prediction served, visually distinct, provably unable to actuate, metrics documented · NL report parsed deterministically, validation-gated, unable to actuate.

---

## 19. Open Questions

None are blocking — each has a stated default that will be used unless overridden.

1. **Alert sound** — default is _off_ (`VITE_ALERT_SOUND_ENABLED=false`) so a demo room isn't startled. Should it default on for the hackathon run?
2. **Priority `acknowledgedPenalty` = −15** — this deliberately sinks acknowledged incidents below unacknowledged ones of similar risk. If the judging narrative prefers "highest risk always ranks first regardless of acknowledgment", say so and it becomes a tie-break instead of a score term.
3. **Demo reading interval** — default `500 ms` (fire confirms in ~2.5 s, which reads well on camera). The prompt's example used 200 ms (~1 s). Either is a one-line config change.
4. **`OFFLINE` visual treatment** — spec uses muted zinc + a distinct pulsing amber LED. Confirm the pulsing LED isn't confusable with WARNING on a projector.
5. **Load scenario scale** — default is 30 simulated zones at 5 Hz in-process. If the demo machine struggles, the fallback is 30 zones at 2 Hz; both are config flags.
6. **Retention automation** — the 90-day raw-reading purge and hourly aggregation are _documented and scripted_ (`scripts/retention.ts`) but not scheduled by default. Confirm that's acceptable for a prototype.

---

**Approval gate.** Per the spec-driven workflow, implementation does not begin until this document is reviewed and approved. The next artefacts are `plan.md` (technical implementation plan) and `tasks.md` (ordered, verifiable tasks).
