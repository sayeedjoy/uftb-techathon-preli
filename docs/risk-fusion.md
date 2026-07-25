# Risk fusion

## The formula

```text
riskScore = 40·fireSignal
          + 25·normalizedGasLevel
          + 20·normalizedWaterLevel
          + 15·occupancyFactor
```

Clamped to `[0, 100]`, rounded to two decimals.

| Classification | Score      |
| -------------- | ---------- |
| `SAFE`         | 0 – 29.99  |
| `WARNING`      | 30 – 64.99 |
| `CRITICAL`     | 65 – 100   |

Weights and thresholds live in [`backend/src/config/risk.config.ts`](../backend/src/config/risk.config.ts)
and are overridable by environment variable. The engine itself
([`risk.service.ts`](../backend/src/modules/risk-engine/risk.service.ts)) contains
no literal numbers.

`OFFLINE` is deliberately absent from the classifier. It is a connectivity fact,
not a score, and is applied afterwards by the zone-state service. No score can
make a zone `OFFLINE`, and `OFFLINE` is never inferred as `SAFE`.

## Why these weights

The weights are chosen so the arithmetic encodes a response policy rather than a
vague sense of severity.

- **Fire = 40.** The only signal that alone reaches `WARNING`, and the only one
  that combined with a single other saturated hazard reaches `CRITICAL`. That
  matches a confirmed-flame policy: flame plus anything means cut the power.
- **Gas = 25.** Gas at 100 % plus a full room (40) stays `WARNING`. A saturated
  gas reading without flame is an evacuate-and-ventilate event, not a
  cut-the-power event. Gas 100 % _with_ confirmed flame is exactly 65 —
  `CRITICAL` at the boundary, by construction.
- **Water = 20.** Below gas because water damages equipment on a slower clock
  than fumes injure people. Full water plus flame is 60 — `WARNING` — and only
  crosses when a third signal joins it.
- **Occupancy = 15.** People are a severity multiplier, never a hazard.
  Occupancy alone is 15, comfortably inside `SAFE`. A zone cannot become
  dangerous merely by being busy.

Worked example from the specification:

```json
{
  "riskScore": 72.5,
  "state": "CRITICAL",
  "contributions": { "fire": 40, "gas": 17.5, "water": 0, "occupancy": 15 },
  "reasons": [
    "Sustained flame confirmed after debounce (5 consecutive readings) (+40)",
    "Gas level is 70% of configured range (+17.5)",
    "Zone is currently occupied (+15)",
    "Combined score crosses the CRITICAL threshold (65)"
  ]
}
```

Reasons are produced by a pure `explain()` function, one rule per contributing
signal, so the dashboard never has to reconstruct _why_ a zone is in its state.

## Sensor processing rules

These run **before** fusion. The engine receives signals that have already been
debounced and gated; it decides how much they weigh, not whether they count.

### Fire debounce — asymmetric on purpose

`fireSignal` becomes 1 only after `FIRE_DEBOUNCE_CONSECUTIVE` (default 5)
consecutive positive readings. It returns to 0 only after
`FIRE_CLEAR_CONSECUTIVE` (default 5) consecutive negatives.

The asymmetry is the point. Confirming slowly stops a flicker raising an alarm;
clearing slowly stops a momentary sensor dropout _during a real fire_ silencing
one. The cost of a missed fire is not the cost of a spurious one, so the two
directions are not treated alike.

A four-reading flicker contributes 0 and says so in the reasons:

> Flame seen on 4 reading(s) — below the debounce threshold, contributing 0

### Gas warm-up

A metal-oxide gas sensor reads high for its first seconds of life. During
`GAS_WARMUP_MS` (5 000 in demo, 30 000 in production) the gas contribution is
forced to 0, the sensor reports `WARMING_UP`, and gas can raise neither state
nor an incident. The suppression is always stated:

> Gas sensor is warming up (4s remaining) — reading suppressed, contributing 0

The window restarts on reconnection, because a node that just rebooted has a
cold sensor again.

### Water phase

Derived from the same normalised value the engine weighs; it changes
presentation and hazard classification, never the arithmetic.

| Phase      | Level                                |
| ---------- | ------------------------------------ |
| `DRY`      | < 0.15                               |
| `RISING`   | 0.15 – 0.59                          |
| `CRITICAL` | ≥ 0.6                                |
| `RESET`    | falls below 0.1 _after_ having risen |

A permanently dry probe reads `DRY`, not `RESET` — `RESET` means "it receded",
which is different from "it was never wet".

### Occupancy — the subtle one

A disconnected occupancy sensor yields `UNAVAILABLE`, **never**
`occupancy: false`. "Nobody is here" and "we don't know" are different facts,
and conflating them is how a control room decides not to send anyone.

Unknown occupancy therefore has two different answers depending on the question:

| Question                                               | Answer  | Why                                                     |
| ------------------------------------------------------ | ------- | ------------------------------------------------------- |
| How much risk does it add?                             | **0**   | The system does not fabricate hazard from missing data. |
| Should we treat the room as occupied when dispatching? | **Yes** | Dispatch fails safe.                                    |

Both halves appear in the reading's reasons:

> Occupancy sensor unavailable — not counted toward risk, but treated as
> occupied for response priority

Confirmed occupancy changes are debounced over
`OCCUPANCY_DEBOUNCE_READINGS` (default 3) so a passer-by cannot spam events.

## Recovery hysteresis

Leaving `CRITICAL` requires the score to sit below
`RISK_THRESHOLD_CRITICAL − STATE_HYSTERESIS` (65 − 5 = 60) for
`RECOVERY_CONSECUTIVE_READINGS` (default 3) consecutive accepted readings.

Without it, a score oscillating around 65 would open and close incidents and
toggle the relay several times a second — at exactly the moment an operator most
needs a stable picture. The integration test drives 63 ↔ 66 across twenty
readings and asserts **one** incident row.

## Test coverage

`risk-engine` and `priority-engine` are gated at ≥ 90 % lines and branches.
The boundaries are asserted exactly:

| Input                    | Score | State      |
| ------------------------ | ----- | ---------- |
| occupancy + water 0.7495 | 29.99 | `SAFE`     |
| occupancy + water 0.75   | 30    | `WARNING`  |
| fire + gas 0.9996        | 64.99 | `WARNING`  |
| fire + gas 1.0           | 65    | `CRITICAL` |

There is no `sleep()` anywhere in the unit suite. Every timing rule takes an
injected clock and the tests advance it explicitly.
