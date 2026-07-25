# Predicted risk (bonus 2)

> **The training data is entirely synthetic.** No real incident data was used,
> and none exists at the volume a model would need. Every metric below is
> measured against a held-out split of that synthetic data and says nothing
> about real-world accuracy.

## What it predicts

*P(this zone reaches CRITICAL within the next 60 seconds)*, served per zone at
`GET /api/v1/prediction/:zoneId`.

## Hard safety boundary

Predicted risk is **advisory**. It can never set a zone state, open an incident,
or drive a buzzer or relay.

That is enforced mechanically, not by convention. `modules/prediction/` imports
nothing from `actuation`, `incidents`, `acknowledgments`, `zone-state` or
`overrides` — and imports no Prisma client at all, so it cannot write anything
anywhere. An architecture test
([`prediction-boundaries.test.ts`](../backend/src/tests/architecture/prediction-boundaries.test.ts))
scans the import graph and fails the build if a forbidden import appears.

The HTTP layer lives in `modules/advisory/` precisely so the prediction module
itself stays free of data access.

In the UI the value carries a `PREDICTED` badge in a visually distinct panel and
is never mixed with the live risk score.

Setting `PREDICTION_ENABLED=false` disables the endpoint and changes nothing
else about the system.

## Model

Logistic regression. Chosen over anything larger for three reasons: the feature
count is small, the coefficients are individually inspectable (you can read why
a prediction was made), and inference is a dot product — no runtime dependency,
no Python, no service call.

### Features

| Feature | Scaling | Rationale |
|---|---|---|
| `currentRisk` | ÷ 100 | Where the zone is now |
| `fireStreak` | ÷ 10 | Consecutive flame positives — momentum toward confirmation |
| `gasSlope` | clamped ±1 | Gas change per second |
| `waterSlope` | clamped ±1 | Water change per second |
| `occupancy` | 0 or 1 | Unknown counts as occupied, same fail-safe rule as priority |
| `secondsSinceTransition` | ÷ 300 | A zone stable for minutes is less likely to tip |
| `assetImportance` | ÷ 8 | Zone configuration |

Everything is scaled into roughly `[0, 1]` so one learning rate suits them all
and the coefficients stay comparable to each other.

### Training data generation

`scripts/train-risk-model.ts` generates 12 000 labelled zone-seconds from a
fixed seed. The generative story: a zone escalates when risk is already elevated
**and** something is still climbing. A calm high-risk zone that has been steady
for minutes rarely tips over.

The label is computed from a latent "hazard momentum" — current risk plus the
projected 60-second contribution of the fire streak and the gas/water slopes —
crossing 65, with noise added so the classes overlap and the problem is not
trivially separable.

Training is reproducible: the same seed produces identical coefficients.

## Results

80/20 split, 9 600 training samples, 2 400 held out.

| Metric | Value |
|---|---|
| Accuracy | 0.845 |
| Precision | 0.897 |
| Recall | 0.762 |
| F1 | 0.824 |
| AUC | 0.893 |

### Confusion matrix (held out)

| | Predicted escalation | Predicted calm |
|---|---|---|
| **Actually escalated** | 875 | 273 |
| **Actually calm** | 100 | 1152 |

Precision above recall is the right shape here even for an advisory signal: a
panel that cries wolf gets ignored, and the *real* alarm path is the deterministic
risk engine, which is not probabilistic at all. Missing an escalation in the
prediction panel costs nothing that matters — the fusion engine still fires when
the hazard actually crosses the threshold.

## Reproducing

```bash
pnpm ml:train
```

Writes `backend/src/modules/prediction/model.json` (coefficients plus metrics)
and prints the table above. If no trained model is present, inference falls back
to conservative hand-set coefficients and reports `modelVersion: "fallback-0"`.

## What this is not

It is not a safety system. It is a small, honest, inspectable model over
synthetic data, wired up so that even if it were badly wrong it could not cause
a single physical action. If real incident data ever existed, the interesting
work would be re-deriving the labels from actual state transitions rather than
from a generative assumption — and every metric here would have to be measured
again from scratch.
