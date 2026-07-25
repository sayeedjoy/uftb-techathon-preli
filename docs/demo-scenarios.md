# Demonstration scenarios

Eleven scenarios, each runnable two ways from the same declarative definition in
[`scenarios.ts`](../backend/src/modules/simulator/scenarios/scenarios.ts):

```bash
pnpm sim:scenario -- --id 5          # headless, exits non-zero on failure
pnpm sim:scenario -- --all           # every scenario in sequence
```

…or one click each on the Simulator page. There is no second, divergent
implementation — what a judge watches is what the runner asserts.

Every run starts by clearing residual hazard inputs, so clicking scenario 5
demonstrates scenario 5 and not the leftovers of scenario 3. Incident counts in
assertions are **deltas** measured against a baseline taken at run start, since
the database ships with seeded history.

---

## 1 · Normal idle state

All three zones stream benign readings.

**Expect:** every zone `SAFE`, no open incidents, no actuation commands, an
empty priority queue.

---

## 2 · Fire debounce

A brief flame flicker, then sustained flame, then the hazard clears.

**Expect:**
- the flicker (fewer than 5 consecutive positives) produces **no** incident and
  contributes 0 — the reading says so in its reasons;
- sustained flame confirms, opens exactly **one** incident, and drives LED red,
  buzzer on, relay cut;
- clearing the flame takes 5 consecutive negatives to drop the signal, then 3
  consecutive calm readings to resolve — recovery is not instant, on purpose.

**Assertions:** zone recovered to `SAFE`/`WARNING`; exactly one incident created
during the run.

---

## 3 · Rising gas

Gas climbs 0 → 0.4 → 0.8 → 1.0, then flame joins it.

**Expect:** the contribution rises proportionally (0 → 10 → 20 → 25) and the
zone walks `SAFE` → `WARNING` → `CRITICAL`. Gas alone tops out at `WARNING` even
saturated with the room occupied — that is the weighting doing its job.

**Assertions:** zone reached `CRITICAL`; the ranking explains the gas
contribution in plain English.

---

## 4 · Server room water leak

Condensate rises under the racks: 0.02 → 0.3 → 0.7 → 1.0.

**Expect:** water phase moves `DRY` → `RISING` → `CRITICAL`; the zone escalates
on a non-fire path.

**Assertions:** Server Room reached `CRITICAL`.

---

## 5 · Simultaneous multi-zone incident ⭐

IoT Lab and Server Room go critical seconds apart.

**Expect:** both scored independently, both actuate independently (disjoint
command sets), the queue ranks them deterministically, and the dashboard shows
*why* rank 1 leads rank 2 — breakdown chips plus reason lines, no detail view
needed.

**Assertions:** both zones `CRITICAL` at the same time; both ranked with
non-empty explanations; the higher-ranked one explains its lead.

This is the scenario to run if you only run one.

---

## 6 · Acknowledgment race

Two concurrent acknowledgments at the same incident.

**Expect:** exactly one `200`, one `409 ALREADY_ACKNOWLEDGED`, one
`Acknowledgment` row, one audit entry, one timeline event.

**Assertions:** `1 × 200` and the remainder `409`.

The integration suite runs the same race ten-wide
(`acknowledgment-race.test.ts`) and additionally asserts the persisted winner is
the user whose request returned 200.

---

## 7 · Sensor offline

A zone's network is cut — nothing is sent at all.

**Expect:** after the timeout the zone shows `OFFLINE`, **never** `SAFE` and
never blank. `lastSeenAt` stays visible, a transition and a `WARN` system event
are recorded, any active incident stays open, and the buzzer and relay are left
exactly as they were.

**Assertions:** zone is `OFFLINE`; the zone states why.

---

## 8 · Dashboard reconnection

An incident is raised while the dashboard socket is down.

**Expect:** on reconnect the dashboard refetches all four snapshots and shows
the current state — and raises **no** duplicate alerts, because replayed events
are dropped by the `eventId` LRU and any event predating the connection is
applied to the cache without a notification.

**Assertions:** the incident is retrievable from the API afterwards.

To watch it by hand: open DevTools → Network → throttle to Offline for ten
seconds while the simulator drives a zone critical, then restore.

---

## 9 · Invalid sensor value

A negative water level and a gas level above 1.

**Expect:** `422 VALUE_OUT_OF_RANGE`, no row written, a `VALIDATION_FAILURE`
system event, and **no risk computed from bad data**. A malformed payload
(wrong types) is a `400` — a different failure with a different meaning.

**Assertions:** 422 for the out-of-range value, 400 for the malformed one, and
the zone did not escalate.

---

## 10 · Backend restart recovery

An active incident is persisted, then the backend is restarted.

**Expect:** zone states, open incidents and the priority queue are rebuilt from
Postgres before the listener binds. A zone that went quiet during the downtime
comes back `OFFLINE`, not `SAFE`. A confirmed fire is still confirmed — the
debounce counters are rehydrated from stored readings.

**Assertions:** an active incident exists to survive the restart.

To watch it by hand: run the scenario, `Ctrl-C` the backend, `pnpm --filter
backend dev`, and compare the queue before and after.

---

## 11 · Load handling

Thirty simulated zones at 5 Hz.

```bash
pnpm sim:load -- --zones 30 --hz 5 --seconds 20
```

**Expect:** every submitted reading is either accepted or explicitly rejected —
zero unaccounted, zero lost, zero duplicated.

Measured on the development machine:

```text
submitted:   1320
accepted:    1320
rejected:    0
unaccounted: 0
throughput:  87.2 accepted readings/s over 15.1s
```

Throughput settles below the nominal 150/s because each simulated node is
self-paced — it waits for its own response before sending again, as a real
device does. See [`resilience.md`](resilience.md) for the two real defects this
run exposed (bcrypt on the hot path, IP-keyed rate limiting) and how they were
fixed.

The harness creates its own zones through the admin API, reuses them idempotently
across runs by rotating their keys, and deactivates them afterwards so the demo
dashboard stays clean.

---

## A seven-minute run

| Time | Do | Point at |
|---|---|---|
| 0:00 | Log in as admin | Dark command centre, three zones, connection badge reads **Live** |
| 0:30 | Simulator → scenario **2** | Flicker produces nothing; sustained flame opens one incident. Banner, toast, queue entry, actuator strip — no refresh |
| 2:00 | Acknowledge from the banner | Attention cue stops, incident stays visible until resolved |
| 2:30 | Scenario **5** | Two zones critical; read the ranking rationale straight off the screen |
| 3:30 | Scenario **9** | Fault buttons return real 400 / 422 in the payload inspector |
| 4:15 | Scenario **7** | Zone goes **Offline**, not Safe. Last-seen time visible |
| 5:00 | `Ctrl-C` the backend, restart | Queue and banner return unchanged |
| 6:00 | Incident History | Filter by date; open the drawer for the full timeline and risk chart |
| 6:40 | `/api/v1/docs` | Swagger with real examples |
