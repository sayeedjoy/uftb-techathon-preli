/**
 * Bonus 2 — offline training.
 *
 *   pnpm ml:train
 *
 * Generates labelled **synthetic** sequences, fits a logistic regression by
 * gradient descent, reports held-out metrics, and exports the coefficients to
 * `src/modules/prediction/model.json` so runtime inference needs no Python and
 * no external service.
 *
 * The training data is synthetic and is labelled as such everywhere it appears.
 * Nothing here has, or needs, access to real incident data.
 */
import { writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  FEATURE_NAMES,
  buildFeatureVector,
  toArray,
  type FeatureName,
  type PredictionInput,
} from "../src/modules/prediction/features.js"

const BACKEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

const SEED = 20260725
const SAMPLE_COUNT = 12_000
const TRAIN_SPLIT = 0.8
const EPOCHS = 400
const LEARNING_RATE = 0.4

/** Deterministic PRNG: the same seed must produce the same coefficients. */
function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return state / 4_294_967_296
  }
}

const random = createRandom(SEED)

type Sample = { features: number[]; label: 0 | 1 }

/**
 * Generates one synthetic zone-second.
 *
 * The generative story: a zone escalates when risk is already elevated *and*
 * something is still climbing (a fire streak building, gas or water rising).
 * A calm high-risk zone that has been steady for minutes rarely tips over.
 */
function generateSample(): Sample {
  const escalating = random() < 0.35

  const input: PredictionInput = escalating
    ? {
        currentRisk: 35 + random() * 30,
        fireStreak: Math.floor(random() * 6),
        gasSlope: random() * 0.5,
        waterSlope: random() * 0.3,
        occupancy: random() < 0.75 ? 1 : 0,
        secondsSinceTransition: random() * 60,
        assetImportance: Math.floor(random() * 9),
      }
    : {
        currentRisk: random() * 45,
        fireStreak: random() < 0.1 ? 1 : 0,
        gasSlope: (random() - 0.5) * 0.1,
        waterSlope: (random() - 0.5) * 0.05,
        occupancy: random() < 0.5 ? 1 : 0,
        secondsSinceTransition: 30 + random() * 400,
        assetImportance: Math.floor(random() * 9),
      }

  // Ground truth: the latent hazard momentum crosses the critical threshold
  // within the 60-second horizon.
  const momentum =
    input.currentRisk +
    input.fireStreak * 6 +
    input.gasSlope * 60 * 25 +
    input.waterSlope * 60 * 20
  const noise = (random() - 0.5) * 8
  const label: 0 | 1 = momentum + noise >= 65 ? 1 : 0

  return { features: toArray(buildFeatureVector(input)), label }
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

function train(samples: Sample[]) {
  const dimension = FEATURE_NAMES.length
  const weights = new Array<number>(dimension).fill(0)
  let intercept = 0

  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    const gradients = new Array<number>(dimension).fill(0)
    let interceptGradient = 0

    for (const sample of samples) {
      let z = intercept
      for (let i = 0; i < dimension; i += 1) {
        z += weights[i]! * sample.features[i]!
      }
      const error = sigmoid(z) - sample.label

      interceptGradient += error
      for (let i = 0; i < dimension; i += 1) {
        gradients[i]! += error * sample.features[i]!
      }
    }

    const scale = LEARNING_RATE / samples.length
    intercept -= scale * interceptGradient
    for (let i = 0; i < dimension; i += 1) {
      weights[i]! -= scale * gradients[i]!
    }
  }

  return { weights, intercept }
}

function evaluate(samples: Sample[], weights: number[], intercept: number) {
  let truePositive = 0
  let falsePositive = 0
  let trueNegative = 0
  let falseNegative = 0

  const scored: Array<{ score: number; label: 0 | 1 }> = []

  for (const sample of samples) {
    let z = intercept
    for (let i = 0; i < weights.length; i += 1) {
      z += weights[i]! * sample.features[i]!
    }
    const probability = sigmoid(z)
    scored.push({ score: probability, label: sample.label })

    const predicted = probability >= 0.5 ? 1 : 0
    if (predicted === 1 && sample.label === 1) truePositive += 1
    else if (predicted === 1) falsePositive += 1
    else if (sample.label === 1) falseNegative += 1
    else trueNegative += 1
  }

  const accuracy = (truePositive + trueNegative) / Math.max(1, samples.length)
  const precision = truePositive / Math.max(1, truePositive + falsePositive)
  const recall = truePositive / Math.max(1, truePositive + falseNegative)
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall)

  // AUC by rank statistic (Mann–Whitney U), so no threshold sweep is needed.
  scored.sort((a, b) => a.score - b.score)
  let rankSum = 0
  let positives = 0
  scored.forEach((entry, index) => {
    if (entry.label === 1) {
      rankSum += index + 1
      positives += 1
    }
  })
  const negatives = scored.length - positives
  const auc =
    positives === 0 || negatives === 0
      ? 0.5
      : (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives)

  return {
    accuracy,
    precision,
    recall,
    f1,
    auc,
    confusion: { truePositive, falsePositive, trueNegative, falseNegative },
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function main(): void {
  console.log(
    `\nGenerating ${SAMPLE_COUNT} SYNTHETIC training samples (seed ${SEED})…`
  )
  const samples = Array.from({ length: SAMPLE_COUNT }, generateSample)

  const splitAt = Math.floor(samples.length * TRAIN_SPLIT)
  const trainingSet = samples.slice(0, splitAt)
  const holdoutSet = samples.slice(splitAt)

  console.log(
    `Training on ${trainingSet.length} samples, holding out ${holdoutSet.length}…`
  )
  const { weights, intercept } = train(trainingSet)
  const metrics = evaluate(holdoutSet, weights, intercept)

  const coefficients = Object.fromEntries(
    FEATURE_NAMES.map((name, index) => [name, round4(weights[index] ?? 0)])
  ) as Record<FeatureName, number>

  const model = {
    version: `logreg-${SEED}`,
    trainedAt: new Date().toISOString(),
    trainingData: "synthetic" as const,
    intercept: round4(intercept),
    coefficients,
    metrics: {
      accuracy: round4(metrics.accuracy),
      precision: round4(metrics.precision),
      recall: round4(metrics.recall),
      f1: round4(metrics.f1),
      auc: round4(metrics.auc),
    },
  }

  const modelPath = path.join(BACKEND_ROOT, "src/modules/prediction/model.json")
  writeFileSync(modelPath, `${JSON.stringify(model, null, 2)}\n`, "utf8")

  console.log("\nHeld-out metrics")
  console.log(`  accuracy   ${model.metrics.accuracy}`)
  console.log(`  precision  ${model.metrics.precision}`)
  console.log(`  recall     ${model.metrics.recall}`)
  console.log(`  F1         ${model.metrics.f1}`)
  console.log(`  AUC        ${model.metrics.auc}`)
  console.log("\nConfusion matrix (held out)")
  console.log(
    `  TP ${metrics.confusion.truePositive}  FP ${metrics.confusion.falsePositive}`
  )
  console.log(
    `  FN ${metrics.confusion.falseNegative}  TN ${metrics.confusion.trueNegative}`
  )
  console.log(`\n✓ Wrote ${path.relative(BACKEND_ROOT, modelPath)}`)
  console.log(
    "  Training data is SYNTHETIC — the model is advisory only, never on the hazard path.\n"
  )
}

main()
