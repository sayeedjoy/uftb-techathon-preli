# Acceptance results

Each of the 30 core criteria from [spec.md §18](spec.md#18-success-criteria),
with the specific test or command that proves it. Run at the end of
implementation against a seeded database.

**Gates:** `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` — all green.
**Tests:** 21 shared + 281 backend + 41 frontend = **343**.

| # | Criterion | Verified by | Result |
|---|---|---|---|
| 1 | ≥ 3 zones monitored | Seed + `ingestion.test.ts › GET /zones returns every zone's current status in one request` | ✅ |
| 2 | Zones submit raw readings, never state | `contract.test.ts › rejects a node-supplied riskScore/state/priority/incidentStatus`; `ingestion.test.ts › never trusts a client-supplied risk score` (400, zero rows) | ✅ |
| 3 | Backend validates and computes risk | `ingestion.test.ts › accepts a raw reading and persists the backend's computed verdict` — asserts 32.5 / `WARNING` / exact contributions in the database | ✅ |
| 4 | Fire debounce prevents brief false triggers | `debounce.service.test.ts` (10 tests); `incident-lifecycle.test.ts › a brief flicker never opens an incident` | ✅ |
| 5 | Gas and water contribute proportionally | `risk.service.test.ts › proportionality` at 0 / 0.25 / 0.5 / 0.75 / 1.0 for both | ✅ |
| 6 | Gas warm-up prevents false alerts | `sensor-rules.test.ts › a saturated gas reading during warm-up cannot reach CRITICAL` | ✅ |
| 7 | Correct transitions among all four states | `risk.service.test.ts › classification boundaries`; `offline.test.ts`; scenarios 2, 3, 4, 7 | ✅ |
| 8 | CRITICAL generates independent actuation | `actuation.test.ts › keeps two simultaneously critical zones' commands disjoint`; `› emits one command per actuator … and no more` (50 readings → 1 buzzer) | ✅ |
| 9 | Multiple zones critical simultaneously | `pnpm sim:scenario -- --id 5` — both `CRITICAL` at once | ✅ |
| 10 | Priority queue ranks deterministically | `priority.service.test.ts › produces byte-identical rankings for 100 shuffled permutations`; tie-break tests | ✅ |
| 11 | Dashboard explains the ranking | `priority-queue.test.tsx › flow 3` — breakdown chips and reason lines in the DOM | ✅ |
| 12 | Real-time dashboard updates | `command-center.test.tsx › flow 5` — a socket event re-renders the card with no refetch loop | ✅ |
| 13 | Multiple alerts independently visible | `command-center.test.tsx › flow 6 › raises one toast per critical incident` | ✅ |
| 14 | Acknowledgment concurrency-safe | `acknowledgment-race.test.ts › lets exactly one of ten concurrent requests win` — 1×200, 9×409, one row, correct winner | ✅ |
| 15 | RBAC enforced by the backend | `admin-rbac.test.ts` — 403 for a staff token on every admin endpoint including zone-scoped ones | ✅ |
| 16 | Incident history date filtering | `priority-queue.test.ts › filters by zone, status, hazard type and date range`; URL-driven filters on the history page | ✅ |
| 17 | Complete incident timeline | `incident-lifecycle.test.ts › records a complete, ordered timeline` — `CREATED` → … → `RESOLVED`, no gaps, no duplicates | ✅ |
| 18 | Duplicates not counted twice | `ingestion.test.ts › rejects a duplicate readingId with 409 and keeps exactly one row`; same for `(zoneId, sequenceNumber)` | ✅ |
| 19 | Impossible readings rejected | `ingestion.test.ts › rejects negative gas / gas above 1 with 422`, zero rows written | ✅ |
| 20 | Out-of-order readings don't corrupt live state | `ingestion.test.ts › stores an out-of-order reading without moving live state` — stored, zone unchanged, no transition, no incident | ✅ |
| 21 | Dashboard reconnects to correct state | `command-center.test.tsx › refetches the snapshot queries on every connect`; `› raises no toast for an event that predates the connection` | ✅ |
| 22 | Backend reconstructs state after restart | `restart-recovery.test.ts › restores zone states, open incidents and the priority queue exactly` (7 tests) | ✅ |
| 23 | Offline sensors never shown as SAFE | `offline.test.ts › marks a silent zone OFFLINE — never SAFE`; `zone-card.test.tsx › flow 7` | ✅ |
| 24 | Normalised related tables | 15 models, foreign keys throughout — [docs/database-schema.md](../docs/database-schema.md) | ✅ |
| 25 | Referential integrity blocks unsafe deletion | `schema-constraints.test.ts › refuses to delete a zone that has incidents / readings` | ✅ |
| 26 | Indexed incident queries stay fast | `pnpm db:explain` — index scan on `incident_active_started_at`, **0.39 ms** against 24 838 readings / 272 incidents (budget 50 ms); exits non-zero on a seq scan | ✅ |
| 27 | Simulator scenarios demonstrate edge cases | All 11 defined; `pnpm sim:scenario -- --id N` runs each headlessly and from the UI | ✅ |
| 28 | Frontend, backend and DB agree on zone state | Every scenario ends with an agreement assertion gathered from the public API; integration tests assert the database row directly | ✅ |
| 29 | Swagger documentation available | `/api/v1/docs` renders **34 documented paths** with request/response examples; `pnpm docs:openapi` emits `docs/openapi.json` | ✅ |
| 30 | README lets another developer run everything | [README.md](../README.md) — prerequisites → install → `db:up` → migrate → seed → dev, with the 5433 note and a troubleshooting section | ✅ |

## Bonus criteria

| Criterion | Verified by | Result |
|---|---|---|
| Trend classified and displayed separately from state | `trend.service.test.ts` (11 tests: flat, rising, falling, noisy, horizon); rendered beside the state badge, never inside it | ✅ |
| Trend provably never affects state | `prediction-boundaries.test.ts › keeps the trend module out of every hazard code path` — import-graph scan | ✅ |
| ML prediction served and visually distinct | `GET /prediction/:zoneId`; `PREDICTED` badge in its own panel | ✅ |
| ML prediction provably unable to actuate | `prediction-boundaries.test.ts` — no import of actuation, incidents, zone-state, **or any Prisma client** | ✅ |
| ML metrics documented | [docs/ml-model.md](../docs/ml-model.md) — accuracy 0.845, precision 0.897, recall 0.762, F1 0.824, AUC 0.893, confusion matrix, synthetic data stated plainly | ✅ |
| NL report parsed deterministically, no paid service | `AI_PROVIDER=none` default; zone-alias, hazard and severity lexicons; no network call | ✅ |
| NL report validation-gated and unable to actuate | `validation-gate.ts` re-parses, discards unknown zones, clamps severity; report is `PENDING` and influences nothing until an admin confirms, then bounded to +5 | ✅ |

## Coverage

`pnpm --filter backend test:coverage` — all thresholds met.

| Area | Threshold | Notes |
|---|---|---|
| `risk-engine` | ≥ 90 % lines/branches | 100 % on `risk.service.ts` and `risk.config.ts` |
| `priority-engine` | ≥ 90 % | met |
| `ingestion`, `incidents`, `acknowledgments`, `actuation` | ≥ 80 % | met |
| Backend overall | ≥ 60 % | **70.63 %** |

## Load handling

```text
$ pnpm sim:load -- --zones 30 --hz 5 --seconds 15

submitted:   1320
accepted:    1320
rejected:    0
unaccounted: 0
throughput:  87.2 accepted readings/s over 15.1s
```

Zero lost, zero duplicated. Throughput settles below the nominal 150/s because
each simulated node is self-paced — it waits for its own response before sending
again, exactly as a real device does.

## Defects this sweep found and fixed

These are recorded because they were real bugs caught by the gates, not
cosmetic adjustments:

1. **Socket de-duplication was per-listener.** The first hook to subscribe
   consumed the `eventId`; every other hook silently missed the event, so cache
   updates landed while their toasts never fired. Found by the stacked-alert
   test. De-duplication now happens once, at a single socket reader, before
   events fan out.
2. **bcrypt on the ingestion hot path.** Verifying a bcrypt-hashed API key per
   reading (~250 ms) collapsed sustained throughput below 1 reading/s. Found by
   the load harness. bcrypt now gates the first presentation of a key; the
   result is cached for 60 s against a constant-time SHA-256 comparison, and a
   rotation invalidates it immediately.
3. **Ingestion rate-limited by IP.** Thirty nodes behind one address shared a
   single budget and throttled each other. Now limited per zone, and excluded
   from the dashboard API budget entirely.
4. **IPv6 rate-limit bypass.** The custom key generator used the raw address, so
   a single /64 could spend the budget one address at a time. Now uses
   `ipKeyGenerator`.
5. **Scenario assertions counted seeded history.** Incident counts were absolute
   rather than deltas from a run baseline, so scenario 2 "failed" on pre-existing
   rows. Now measured as a delta, and each run clears residual hazard inputs so a
   scenario demonstrates itself rather than its predecessor's leftovers.

## Known limitations

- **Single process.** One backend owns the HTTP server, socket server,
  heartbeat sweeper and simulator engine. What changes at multi-instance scale
  is written up in [docs/resilience.md](../docs/resilience.md) rather than built.
- **Token in `localStorage`.** The brief's API surface has no refresh endpoint.
  The XSS tradeoff and what would replace it are in
  [docs/security.md](../docs/security.md).
- **Retention is not scheduled.** `pnpm --filter backend retention` is dry-run
  by default and deliberately not automated.
- **OpenAPI is hand-authored**, not generated from the Zod schemas — the
  documented fallback for plan risk R3. The endpoint contract is identical
  either way, but the document can drift if a schema changes without it.
