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

Only for the ESP32 node — the rest of the platform runs without them:

| Tool                     | For                                       |
| ------------------------ | ----------------------------------------- |
| PlatformIO Core          | building the firmware (`pio run`)         |
| Wokwi for VS Code        | **Start Simulator** — the one-click board |
| `wokwi-cli` + a CI token | headless runs and the boot scenario       |

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

Open **http://localhost:5173** and sign in with the credentials below.

> The seed prints the zone API keys once and writes them to
> `backend/.dev-zone-keys.json` and `backend/.env.simulator` — both gitignored.
> The database stores only bcrypt hashes; if you lose the plaintext, rotate the
> key rather than trying to recover it. Re-print with
> `pnpm --filter backend print-zone-keys`.

Zones open as **OFFLINE** until something feeds them — that is intentional, not a
fault. Drive them from the **Simulator** page, or run a scenario:

```bash
pnpm sim:scenario -- --id 5         # two zones critical at once, ranked
```

### Optional — the ESP32 zone node in Wokwi

The sensing layer is a separate PlatformIO project and is not part of the pnpm
workspace, so no JS gate touches it. It drives the same HTTP API the simulator
does, with a zone API key of its own — invariant 1 binds it exactly as it binds
every other node.

```bash
pnpm firmware:config -- --all --registry   # zone credentials, all zones
cd firmware && pio run                     # build all four environments
```

Those two flags do different jobs and `pio run` needs both:

| Flag         | Writes                    | Used by                                           |
| ------------ | ------------------------- | ------------------------------------------------- |
| `--all`      | `include/zones/<code>.h`  | the `iot-lab`, `robotics-lab`, `server-room` envs |
| `--registry` | `include/zone_registry.h` | the `multi-room` env's runtime zone table         |

Both are gitignored — they hold live keys — and both go stale on every
`pnpm db:seed`, because zone keys rotate by design. Re-run the command after a
reseed.

**One click in VS Code.** Open the `firmware/` folder and press **Start
Simulator**. [wokwi.toml](firmware/wokwi.toml) points at the `multi-room`
binary: one board that can be any of the three rooms. Press the blue **ZONE**
button (GPIO 13) and the credentials, the URL and the reported sensor set all
move together — Server Room reports water and no gas, so you can see the
identity change rather than take it on trust.

**Headless.** Needs a `WOKWI_CLI_TOKEN` from
[wokwi.com/dashboard/ci](https://wokwi.com/dashboard/ci) — a _different_
credential from the VS Code extension's licence, which the CLI rejects.

```bash
export WOKWI_CLI_TOKEN=wok_...
cd firmware
wokwi-cli . --scenario test/boot.scenario.yaml --timeout 60000   # boot assertions
./run-all-zones.sh 60                                           # three zone nodes at once
```

> **Reaching a backend on your own machine needs Wokwi's paid Private IoT
> Gateway** — that is what makes `host.wokwi.internal` resolve. Without it the
> board boots and runs correctly but cannot deliver readings, so the dashboard
> keeps showing zones OFFLINE. Drive the dashboard from `pnpm sim:scenario`
> instead, or deploy the API somewhere public and point `API_BASE_URL` at it.

Full detail in [firmware/README.md](firmware/README.md); the schematic and pin
map are in [docs/circuit-diagram.md](docs/circuit-diagram.md).

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

Each scenario's script, description and assertions live beside it in
`backend/src/modules/simulator/scenarios/`.

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

### Firmware

```bash
pnpm firmware:config                          # print iot-lab's block, write nothing
pnpm firmware:config -- server-room --write   # one zone → include/zone_secrets.h
pnpm firmware:config -- --all --registry      # every zone: per-zone headers + registry

cd firmware
pio run                                       # all four environments
pio run -e server-room                        # just one
pio run -t upload -t monitor                  # flash a physical board
./run-all-zones.sh 60                         # three Wokwi sessions, one per zone
```

Zone credentials rotate on every `pnpm db:seed`, so re-run `firmware:config`
after a reseed. Details in [firmware/README.md](firmware/README.md).

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

firmware/          ESP32 zone node — PlatformIO + Wokwi. Outside the pnpm
                   workspace; build with `pio run`. Posts raw readings and
                   pulls actuation commands over the same HTTP API any node
                   uses, so invariant 1 binds it too.
  src/main.cpp     One firmware, four builds: a dedicated binary per zone plus
                   `multi-room`, a single board that switches room on a button.
  zones/<code>/    That zone's diagram.json; `multi/` adds the ZONE button.
  test/            Wokwi CI scenarios — boot, sensor conversion, local fallback.
  wokwi.toml       What "Start Simulator" launches in VS Code.

docs/              System architecture, circuit diagram, API reference,
                   database schema, risk fusion formula.
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
  explanation.
- **Concurrency-safe acknowledgment** — ten simultaneous requests yield exactly
  one `200`, nine `409`, and one row.
- **Offline that means unknown, not safe.** A silent zone keeps its incident
  open, keeps its buzzer on and shows when it was last seen.
- **Restart recovery** — every in-memory cache is rebuilt from Postgres before
  the listener binds.
- **A simulator that drives the real API** over HTTP with server-held zone keys,
  so a demo exercises the actual pipeline. No API key ever reaches the browser.

### Bonus features

All three are implemented and all three are firewalled from the hazard path:

- **Risk trend** (moving average + least-squares slope) rendered beside the
  state badge, never inside it.
- **Predicted risk** — logistic regression on explicitly synthetic data, with an
  architecture test proving the module cannot import actuation or incidents, and
  imports no database client at all.
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

The most common ones are below. For the complete set — including firmware, Wokwi,
ingestion rejections and test failures — see
**[docs/troubleshooting.md](docs/troubleshooting.md)**.

**Port 5432 is already in use.** It should be — a local PostgreSQL install owns
it. Docker binds **5433** deliberately; check `backend/.env` points there.

**Zones show OFFLINE.** Correct behaviour — nothing is feeding them. Start them
from the Simulator page or run a scenario. Offline means unknown, not safe.

**`@prisma/client did not initialize yet`.** Run
`pnpm --filter backend exec prisma generate`. `pnpm db:migrate` does this for
you; `db:deploy` does not.

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

**Wokwi says `firmware.bin not found`.** `wokwi.toml` points at the
`multi-room` build. Generate its zone table and build it:
`pnpm firmware:config -- --registry && cd firmware && pio run -e multi-room`.

**The firmware won't compile — no `zone_registry.h` / `zones/<code>.h`.** Those
are generated, not committed. Run `pnpm firmware:config -- --all --registry`
(after `pnpm db:seed`, which is what produces the keys).

---

## Documentation

| Document                                                                | Covers                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| [architecture.md](docs/architecture.md)                                 | System shape, data flow, layering, in-memory state    |
| [circuit-diagram.md](docs/circuit-diagram.md)                           | ESP32 node — schematic, pin map, per-zone boards      |
| [api.md](docs/api.md)                                                   | Every endpoint, envelope, status codes, socket events |
| [database-schema.md](docs/database-schema.md)                           | ERD, constraints, indexes, the performance gate       |
| [risk-fusion.md](docs/risk-fusion.md)                                   | The formula, **why these weights**, sensor rules      |
| [deployment.md](docs/deployment.md)                                     | Production config, Docker, proxying, scaling limits   |
| [troubleshooting.md](docs/troubleshooting.md)                           | Every failure mode we have actually hit, and why      |
| [SCS-RG-System-Documentation.pdf](docs/SCS-RG-System-Documentation.pdf) | The consolidated submission document                  |

Interactive API docs: **`http://localhost:4000/api/v1/docs`**.
