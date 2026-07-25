# SCS-RG — Multi-Hazard Smart Campus Safety & Response Grid

A real-time campus emergency monitoring and response platform. Independent zones
stream **raw** sensor readings; the backend is the sole authority for validation,
risk fusion, state classification, incident lifecycle, response ranking and
actuation. A security command dashboard renders the live picture and lets staff
acknowledge and resolve incidents.

The rule everything else follows: **a sensor node is never trusted with a
computed value.** A payload carrying its own `riskScore` or `state` is rejected
with `400`, not quietly ignored.

---

## Prerequisites

| Tool           | Version                 |
| -------------- | ----------------------- |
| Node.js        | 22+ (developed on 24)   |
| pnpm           | 10+ (developed on 11.5) |
| Docker Desktop | for PostgreSQL 18       |

`psql` is optional but handy. **Docker Postgres binds host port 5433**, not 5432
— a local PostgreSQL install usually owns 5432 and the two would collide.

## First run

```bash
pnpm install

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

pnpm db:up                          # PostgreSQL 18 on host port 5433
pnpm --filter @scsrg/shared build   # the wire contract both apps compile against
pnpm db:migrate                     # apply migrations
pnpm db:seed                        # users, zones, keys, 10k+ readings, history

pnpm dev                            # shared --watch + backend :4000 + frontend :5173
```

Open **http://localhost:5173**.

> The seed prints the zone API keys once and writes them to
> `backend/.dev-zone-keys.json` and `backend/.env.simulator` — both gitignored.
> The database stores only bcrypt hashes; if you lose the plaintext, rotate the
> key rather than trying to recover it. Re-print with
> `pnpm --filter backend print-zone-keys`.

### Development-only credentials

> ⚠️ **These are seeded for local demonstration only. Never use them anywhere
> real.**

| Role             | Email                  | Password       |
| ---------------- | ---------------------- | -------------- |
| `ADMIN`          | `admin@scsrg.local`    | `Admin123!`    |
| `SECURITY_STAFF` | `security@scsrg.local` | `Security123!` |

Sign in as the admin to reach the Simulator, System Health, Administration and
Audit Log pages. Sign in as security staff to see RBAC working — those pages
disappear from the navigation, and deep-linking to them is refused by both the
route guard and the backend.

---

## The seven-minute demo

| Time | Do                                          | Point at                                                                                                                                     |
| ---- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 | Log in as admin                             | Three zones, connection badge reads **Live**                                                                                                 |
| 0:30 | Simulator → **2 · Fire debounce**           | A flicker produces nothing; sustained flame opens exactly one incident. Banner, toast, queue entry and actuator strip appear with no refresh |
| 2:00 | Acknowledge from the banner                 | The attention cue stops; the incident stays visible until it resolves                                                                        |
| 2:30 | Simulator → **5 · Simultaneous multi-zone** | Two zones critical at once. Read _why_ rank 1 outranks rank 2 straight off the screen                                                        |
| 3:30 | Simulator → **9 · Invalid sensor value**    | The payload inspector shows the backend's real `400` and `422`                                                                               |
| 4:15 | Simulator → **7 · Sensor offline**          | The zone reads **Offline**, never Safe, with its last-seen time                                                                              |
| 5:00 | `Ctrl-C` the backend, then restart it       | The queue and banner come back unchanged — state was rebuilt from Postgres                                                                   |
| 6:00 | Incident History                            | Filter by date, open a row for the full timeline and risk chart                                                                              |
| 6:40 | `/api/v1/docs`                              | Swagger with real request/response examples                                                                                                  |

Every scenario also runs headlessly and fails the shell on a bad assertion:

```bash
pnpm sim:scenario -- --id 5
pnpm sim:scenario -- --all
```

Full descriptions and expected outcomes: [docs/demo-scenarios.md](docs/demo-scenarios.md).

---

## Commands

### Daily

```bash
pnpm dev                    # everything, watched
pnpm --filter backend dev   # backend only  → :4000
pnpm --filter frontend dev  # frontend only → :5173
```

### Gates

```bash
pnpm typecheck              # tsc --noEmit across all three packages
pnpm lint                   # eslint across all three packages
pnpm test                   # shared + backend (unit & integration) + frontend
pnpm build                  # shared → backend → frontend
```

### Database

```bash
pnpm db:up / db:down        # Docker Postgres on 5433
pnpm db:migrate             # prisma migrate dev
pnpm db:seed                # idempotent — safe to re-run
pnpm db:seed:load           # bulk history for the performance gate
pnpm db:explain             # EXPLAIN ANALYZE gate; exits non-zero on a seq scan
pnpm db:studio              # Prisma Studio
pnpm db:backup              # timestamped pg_dump into backups/
```

### Demo and operations

```bash
pnpm sim:scenario -- --id 5              # one scenario, headless
pnpm sim:load -- --zones 30 --hz 5       # the load harness
pnpm ml:train                            # retrain the bonus prediction model
pnpm docs:openapi                        # emit docs/openapi.json
pnpm --filter backend retention          # retention dry run
```

---

## Layout

```text
packages/shared/   @scsrg/shared — domain enums, Zod schemas, API envelope,
                   Socket.IO event map. Both apps typecheck against it, so a
                   DTO cannot drift on one side only.

backend/           Express 5 · Prisma 6 · Socket.IO 4 · PostgreSQL 18
  src/modules/     One folder per capability: controller, service, repository,
                   routes, tests. Business rules live in services; Prisma lives
                   only in repositories; the risk and priority engines are pure
                   functions with no clock and no I/O.
  src/tests/       Integration suites against a dedicated `scsrg_test` database.

frontend/          React 19 · Vite 8 · Tailwind 4 · shadcn/ui (base-maia)
                   TanStack Query owns server data; sockets patch or invalidate
                   that cache and are never a parallel source of truth.

docs/              Architecture, risk fusion, priority ranking, security,
                   resilience, database schema, demo scenarios, retention, ML.
```

---

## What it does

- **Three seeded zones** — IoT Lab, Server Room, Robotics Lab — each with its own
  sensor set, asset importance and API credential. Adding a fourth is a row or a
  `POST /admin/zones` call; no code changes.
- **Risk fusion** `40·fire + 25·gas + 20·water + 15·occupancy`, clamped to
  0–100, with per-signal contributions and plain-English reasons stored on every
  reading. Weights and thresholds are configuration.
  ([docs/risk-fusion.md](docs/risk-fusion.md))
- **Sensor rules that matter** — asymmetric fire debounce (slow to confirm,
  slower to clear), gas warm-up suppression, water phases, and occupancy that
  reports _unavailable_ rather than pretending a room is empty.
- **Incident lifecycle** with recovery hysteresis, so a score oscillating around
  the threshold produces one incident rather than a dozen. Enforced by a partial
  unique index in Postgres, never by application logic.
- **Deterministic priority ranking** with a total sort order and a visible
  explanation. ([docs/priority-ranking.md](docs/priority-ranking.md))
- **Concurrency-safe acknowledgment** — ten simultaneous requests yield exactly
  one `200`, nine `409`, and one row.
- **Offline that means unknown, not safe.** A silent zone keeps its incident
  open, keeps its buzzer on and shows when it was last seen.
- **Restart recovery** — every in-memory cache is rebuilt from Postgres before
  the listener binds. ([docs/resilience.md](docs/resilience.md))
- **A simulator that drives the real API** over HTTP with server-held zone keys,
  so a demo exercises the actual pipeline. No API key ever reaches the browser.

### Bonus features

All three are implemented and all three are firewalled from the hazard path:

- **Risk trend** (moving average + least-squares slope) rendered beside the
  state badge, never inside it.
- **Predicted risk** — logistic regression on explicitly synthetic data, with an
  architecture test proving the module cannot import actuation or incidents, and
  imports no database client at all. ([docs/ml-model.md](docs/ml-model.md))
- **Natural-language field reports** — deterministic extraction, no paid service
  required, `PENDING` until a human confirms, and even then bounded to +5
  priority points.

---

## Tests

```bash
pnpm test
```

- **Backend:** 268 tests — pure-engine unit tests (no `sleep()` anywhere; every
  timing rule takes an injected clock), integration suites over a real Postgres,
  a ten-way acknowledgment race, restart reconstruction, and an architecture test
  over the import graph.
- **Frontend:** 41 tests covering the eight named flows — zone status rendering,
  priority ordering, ranking explanation, acknowledgment (including the `409`
  path), role-restricted controls, socket-driven updates, offline status, and
  stacked alerts.

Integration tests run against a dedicated `scsrg_test` database, single-threaded
with truncation between tests, and pass in any order.

---

## Troubleshooting

**Port 5432 is already in use.** It should be — a local PostgreSQL install owns
it. Docker binds **5433** deliberately; check `backend/.env` points there.

**`Cannot find module '@scsrg/shared'`.** The shared package builds to `dist/`.
Run `pnpm --filter @scsrg/shared build` (or `pnpm dev`, which watches it).

**Docker isn't running.** `pnpm db:up` fails with a named-pipe error. Start
Docker Desktop and retry.

**Migration drift after pulling.** `pnpm db:migrate` applies anything pending.
The partial unique index lives in a hand-written migration — if it goes missing,
the one-active-incident guarantee goes with it.

**The simulator says "no key".** Run `pnpm db:seed`, which regenerates
`backend/.dev-zone-keys.json`. Keys rotate on every seed by design.

**Backend exits immediately on start.** Configuration is Zod-validated at boot
and the process refuses to start on a bad value — read the message, it names the
key. `JWT_SECRET` must be at least 32 characters.

**Port 4000 already in use.** A previous backend is still running. On Windows:
`netstat -ano | findstr :4000`, then `taskkill /PID <pid> /F`.

---

## Documentation

| Document                                        | Covers                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| [architecture.md](docs/architecture.md)         | System shape, data flow, layering, in-memory state    |
| [api.md](docs/api.md)                           | Every endpoint, envelope, status codes, socket events |
| [database-schema.md](docs/database-schema.md)   | ERD, constraints, indexes, the performance gate       |
| [risk-fusion.md](docs/risk-fusion.md)           | The formula, **why these weights**, sensor rules      |
| [priority-ranking.md](docs/priority-ranking.md) | Priority formula, determinism, the race               |
| [security.md](docs/security.md)                 | Auth, RBAC, hashing, redaction, tradeoffs             |
| [resilience.md](docs/resilience.md)             | Offline, restart, concurrency, load, scaling          |
| [demo-scenarios.md](docs/demo-scenarios.md)     | All eleven scenarios and what to expect               |
| [data-retention.md](docs/data-retention.md)     | Retention policy, backup, recovery window             |
| [ml-model.md](docs/ml-model.md)                 | Bonus 2 — model, synthetic data, metrics, boundary    |

Interactive API docs: **`http://localhost:4000/api/v1/docs`**.
