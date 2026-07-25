# Priority ranking

Risk and priority answer different questions:

> **Risk:** how dangerous is this zone?
> **Priority:** which critical zone should security reach first?

They are separate scores with separate tuning knobs, because a saturated but
empty server room can be more dangerous and less urgent than a moderate hazard
in a full teaching lab.

## The formula

```text
priorityScore = riskScore
              + occupancyBonus        (10 when occupied or occupancy unknown)
              + criticalDurationBonus (min(10, floor(criticalSeconds / 6)))
              + assetImportanceBonus  (zone.assetImportance, 0–8)
              + multiHazardBonus      (5 when ≥ 2 hazard signals are active)
              + humanReportBonus      (≤ 5, only from a CONFIRMED field report)
              − acknowledgedPenalty   (15 when status = ACKNOWLEDGED)
```

Every term is configurable in
[`priority.config.ts`](../backend/src/config/priority.config.ts).

### Why each term

- **Occupancy (+10).** People outrank equipment. Unknown occupancy also earns
  the bonus — dispatch fails safe, even though the same unknown contributes
  nothing to the risk score.
- **Duration (≤ +10).** A zone that has been critical for a minute is either
  escalating or unattended. Capped so an old incident cannot permanently
  outrank a fresh, worse one.
- **Asset importance (0–8).** Configuration, not code. The server room is 8; the
  IoT lab is 5.
- **Multi-hazard (+5).** Fire *and* gas is qualitatively worse than either
  alone, and needs a different response.
- **Acknowledged (−15).** Someone is already on their way. This deliberately
  sinks acknowledged incidents below unacknowledged ones of similar risk, so the
  queue answers "where is nobody going yet?". If the preferred narrative is
  "highest risk always first", make this a tie-break instead of a score term —
  it is one config value.
- **Human report (≤ +5).** Bonus 3. Only a report an administrator has
  *confirmed* contributes anything, and its influence is bounded.

## Determinism

Ranking sorts by a **total order**:

```text
priorityScore DESC → riskScore DESC → startedAt ASC → incidentId ASC
```

Because the chain ends in a unique id, identical inputs in any arrival order
produce a byte-identical ranking. That matters practically: two operators at two
screens must see the same rank 1.

The unit test runs 100 deterministic shuffles of the same incident set and
asserts the serialised ranking is identical every time.

Recalculation happens whenever an incident opens, is acknowledged, resolves or
has its risk updated — and on boot. The `GET /priority-queue` endpoint
recomputes rather than trusting the stored score, because the duration term
moves with wall-clock time: a queue read a minute later genuinely is a different
queue.

## Worked example

Two zones go critical seconds apart (demonstration scenario 5):

| | IoT Lab | Server Room |
|---|---|---|
| risk | 77.5 | 73 |
| occupancy | +10 | +10 |
| duration | +2 | +1 |
| asset | +5 | +8 |
| multi-hazard | +5 | +5 |
| acknowledged | 0 | 0 |
| **priority** | **99.5** | **97** |

IoT Lab leads on live risk; Server Room claws back three points on asset value
but not enough to overtake. The dashboard renders exactly this breakdown as
labelled chips plus the reason lines, so the ordering is legible without opening
a detail view:

```json
{
  "rank": 1,
  "zoneName": "IoT Lab",
  "riskScore": 77.5,
  "priorityScore": 99.5,
  "breakdown": {
    "risk": 77.5, "occupancy": 10, "duration": 2,
    "asset": 5, "multiHazard": 5, "acknowledged": 0, "humanReport": 0
  },
  "reasons": [
    "Live risk score 77.5",
    "Zone is occupied (+10)",
    "Confirmed fire and gas hazards (+5)",
    "Critical for 12 seconds (+2)",
    "High-value zone, asset importance 5 (+5)"
  ]
}
```

## Acknowledgment concurrency

Two officers may click Acknowledge in the same millisecond. Exactly one wins,
guaranteed by two database-level mechanisms:

1. A conditional update whose predicate and write are a single statement:
   `UPDATE "Incident" SET status='ACKNOWLEDGED' WHERE id=$1 AND status='OPEN'`.
   Two concurrent requests cannot both observe `OPEN`. Zero rows affected means
   you lost, and the caller gets `409 ALREADY_ACKNOWLEDGED`.
2. `UNIQUE(incidentId)` on `Acknowledgment`, which would reject a second row
   even if the first guard were somehow bypassed.

Disabling the button in the browser is a courtesy, never the mechanism. The
named test fires ten concurrent requests through the real HTTP stack and asserts
`1 × 200`, `9 × 409`, exactly one `Acknowledgment` row, one audit entry, one
timeline event — and that the persisted winner is the user whose request
returned 200.
