# Troubleshooting

Failure modes that have actually happened, with the diagnosis rather than just
the fix. The [README](../README.md) carries a short list of the most common ones;
this is the complete set.

---

## Setup and tooling

**`pnpm` is not found.** On Windows `corepack enable` can fail with `EPERM`
because the shims land under `Program Files`. Install it with
`npm i -g pnpm@11.5.2` instead and make sure `%APPDATA%\npm` is on `PATH`.

**`Cannot find module '@scsrg/shared'`.** The shared package builds to `dist/`
and that build is stale or missing. `pnpm --filter @scsrg/shared build`, or run
`pnpm dev`, which watches it. This is the single most common error in the repo,
and it means the same thing every time.

**`@prisma/client did not initialize yet`.** The client has not been generated
against the schema. `pnpm db:migrate` generates it as a side effect; `pnpm
db:deploy` and `prisma migrate deploy` **do not**. Run
`pnpm --filter backend exec prisma generate`.

**Port 5432 is already in use.** It should be — a local PostgreSQL install owns
it. Docker binds **5433** deliberately. Check `DATABASE_URL` in `backend/.env`
points at 5433.

**Docker is not running.** `pnpm db:up` fails with a named-pipe error. Start
Docker Desktop and wait for the whale to settle before retrying.

---

## Backend will not start

**It exits immediately.** Configuration is Zod-validated at boot and the process
refuses to run misconfigured. The message names the offending key. The usual
culprits:

- `JWT_SECRET` shorter than 32 characters.
- `AI_PROVIDER=openrouter` with no `OPENROUTER_API_KEY`. Selecting a provider
  without its key is a hard failure by design — set `AI_PROVIDER=none` to use the
  deterministic extractor, which needs no key and no network.

**Port 4000 already in use.** A previous backend is still alive. On Windows:
`netstat -ano | findstr :4000`, then `taskkill /PID <pid> /F`.

---

## The dashboard cannot reach the backend

**Every login returns `500`, and the backend logs
`Origin http://localhost:5174 is not allowed by CORS policy`.**

Vite fell back to **5174** because something already held 5173 — usually a second
`pnpm dev`. The browser is then on an origin missing from `CORS_ORIGINS`, so
every request is rejected.

Check the Vite banner says `Local: http://localhost:5173/`. If it says 5174, stop
the other instance rather than adding 5174 to the allowlist. Note the rejection
surfaces as `500 INTERNAL_ERROR` rather than a `403`, which makes it look like a
server fault; the log line is the giveaway.

**The connection badge never reads Live.** Behind a proxy, the WebSocket upgrade
is not being forwarded — pass through `Upgrade` and `Connection`. See
[deployment.md](deployment.md).

---

## Zones show OFFLINE when you expect SAFE

**This is usually correct behaviour.** `ZONE_OFFLINE_TIMEOUT_MS` is 10 s, so a
zone with nothing feeding it goes OFFLINE ten seconds after its last reading.
Offline means unknown, not safe — the incident stays open and the actuators stay
on, deliberately.

To hold zones at SAFE you need something actively publishing:

- **Simulator page → Start** on each zone (`POST /simulator/zones/:id/start`).
  This is the one that keeps the three real zones alive.
- **`pnpm sim:load` will not do this.** It creates its own `load-zone-01…N`
  phantom zones, drives those, and deactivates them when it finishes. It is the
  load harness for Test Case 11, not a keep-alive.
- **Running a scenario stops the streams.** After `pnpm sim:scenario -- --id N`
  the simulator reports `running: false` for every zone, and ten seconds later
  they all drop to OFFLINE. Press Start again.

---

## Ingestion rejections

These are the contract working. The response body names the offending field, and
the firmware logs `error.code` and `error.message` verbatim to serial.

| Status | Code                    | What it means                                                                                                                                         |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `VALIDATION_ERROR`      | Unknown key, missing field, wrong type. A payload carrying `riskScore` or `state` lands here — computed values are rejected, never silently stripped. |
| `422`  | `VALUE_OUT_OF_RANGE`    | `gasLevel` outside 0..1, or a timestamp beyond `MAX_FUTURE_TIMESTAMP_SKEW_MS`.                                                                        |
| `422`  | `SENSOR_NOT_CONFIGURED` | A channel the zone has no sensor row for. Fix the `REPORT_*` flags, not the backend.                                                                  |
| `401`  | —                       | Wrong, missing or another zone's API key.                                                                                                             |
| `409`  | `DUPLICATE_READING`     | That `readingId` or sequence number is already recorded.                                                                                              |

**Everything is rejected with `409` and the zone appears wedged.**
`sequenceNumber` is unique per zone and must never decrease — a reading numbered
below the zone's latest accepted one is refused. A node whose counter restarted
at `1` sits permanently below its own history. The firmware anchors its counter
to the wall clock once NTP lands and publishes nothing before then; if you write
your own client, do the same.

**The simulator says "no key".** Run `pnpm db:seed`, which regenerates
`backend/.dev-zone-keys.json`. Keys rotate on every seed by design.

---

## Firmware and Wokwi

**`firmware.bin not found in workspace`.** `wokwi.toml` points at
`.pio/build/multi-room/`. Build it: `cd firmware && pio run`. All four
environments are in `default_envs`, so a plain `pio run` is enough.

**The CLI rejects your Wokwi licence.** The VS Code extension's licence
(`~/.wokwi/user.tok`) and the CI token are **different credentials**. `wokwi-cli`
needs `WOKWI_CLI_TOKEN` from [wokwi.com/dashboard/ci](https://wokwi.com/dashboard/ci);
the free tier includes 50 simulation minutes a month.

**The node cannot reach `localhost:4000` — `Transport error: connection
refused`.** `host.wokwi.internal` only resolves with Wokwi's **Private IoT
Gateway**, which is a paid feature. Without it the board runs correctly but
cannot deliver readings, and every zone stays OFFLINE. Use `pnpm sim:scenario` to
drive the backend instead, or deploy the API somewhere publicly reachable.

**A sensor reads a plausible-looking but wrong value that drifts.** The wire is
landing on a pin the part does not have. Wokwi **silently ignores** a connection
to a non-existent pin, leaving the GPIO floating — and a floating ADC reads as a
hazard. Run `wokwi-cli lint .`, which reports `invalid-pin` explicitly. The
published docs are not always right about pin names; the linter is authoritative.

A steady reading is connected; a wandering one usually is not.

**Serial output walks diagonally down the screen.** A bare `\n` moves down a line
without returning the carriage. Use `\r\n` in `Serial.printf` format strings —
`Serial.println` already appends both.

**`409 DUPLICATE_READING` right after switching rooms on the multi-room build.**
`readingId` is unique across the whole table, not per zone, so it must name the
zone. Fixed in the current firmware; if you fork it, keep the zone code in the id.

**`422 SENSOR_NOT_CONFIGURED` after switching rooms.** A queued reading was
re-serialised with the _selected_ room's channels instead of its own. Anything
touching a stored snapshot must read that snapshot's `zoneIndex`, not the active
zone.

---

## Tests

**`restart-recovery.test.ts` fails with `expected 'OFFLINE' to be 'CRITICAL'`.**
The integration suite sets `ZONE_OFFLINE_TIMEOUT_MS=300` so `offline.test.ts` can
watch a zone fall silent without a long sleep. On a loaded machine the queries
between a test's last reading and its restart can exceed that budget, so
reconstruction correctly reports OFFLINE. Tests asserting on restored _live_
state call `markAllZonesJustSeen()` first; tests asserting a zone was silent
during downtime must not.

**Integration tests interfere with each other.** They are deliberately
single-threaded and truncate every table before each test. Do not add
parallelism — order-independence is a hard requirement, and a failed test leaves
its rows behind on purpose so you can inspect them.

**`pnpm db:explain` exits non-zero.** The gate asserts the planner uses
`Incident_status_createdAt_idx`, but on a small `Incident` table a sequential scan
is genuinely cheaper and Postgres is right to prefer it. Confirm the index is
usable with `SET enable_seqscan=off` before assuming a regression; run
`pnpm db:seed:load` first if you want a realistic volume.

**`pnpm format:check` reports hundreds of files.** Prettier resolved to a newer
version than the one the repo was formatted with. It is not a regression from
your change — check whether files you never touched also fail before chasing it.

---

## Still stuck

The logs are the fastest path. The backend logs structured JSON with the
rejection code and offending field; the firmware logs the same code to serial.
Both name the field. Reading the body beats guessing at the schema.
