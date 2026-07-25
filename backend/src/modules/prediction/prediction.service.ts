import { createRequire } from "node:module"

import {
  FEATURE_NAMES,
  buildFeatureVector,
  type FeatureName,
  type PredictionInput,
} from "./features.js"

/**
 * Bonus 2 — inference.
 *
 * Pure TypeScript: the model is a logistic regression whose coefficients were
 * trained offline (`pnpm ml:train`) on **explicitly synthetic** data and
 * exported to `model.json`. There is no Python and no external service at
 * runtime, and disabling the feature changes nothing else about the system.
 *
 * Hard boundary: this module imports nothing from actuation, incidents or
 * zone-state, so a predicted probability has no path to a physical response.
 */
export type PredictionModel = {
  version: string
  trainedAt: string
  /** Explicitly recorded so nobody mistakes this for real incident data. */
  trainingData: "synthetic"
  intercept: number
  coefficients: Record<FeatureName, number>
  metrics?: Record<string, number>
}

/**
 * Fallback coefficients, used when no trained model has been exported yet.
 * Deliberately conservative: fire streak and current risk dominate.
 */
const FALLBACK_MODEL: PredictionModel = {
  version: "fallback-0",
  trainedAt: "1970-01-01T00:00:00.000Z",
  trainingData: "synthetic",
  intercept: -4.2,
  coefficients: {
    currentRisk: 5.6,
    fireStreak: 3.1,
    gasSlope: 2.4,
    waterSlope: 1.6,
    occupancy: 0.5,
    secondsSinceTransition: -0.8,
    assetImportance: 0.2,
  },
}

let cached: PredictionModel | null = null

export function loadModel(): PredictionModel {
  if (cached) return cached

  try {
    const require = createRequire(import.meta.url)
    const loaded = require("./model.json") as PredictionModel
    if (typeof loaded.intercept === "number" && loaded.coefficients) {
      cached = loaded
      return cached
    }
  } catch {
    // No exported model yet — `pnpm ml:train` produces one.
  }

  cached = FALLBACK_MODEL
  return cached
}

export function resetModelCache(): void {
  cached = null
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

export type PredictionResult = {
  probabilityCriticalWithin60s: number
  confidence: number
  featureContributions: Record<string, number>
  modelVersion: string
}

/**
 * Predicts P(zone reaches CRITICAL within the next 60 seconds).
 *
 * The result is advisory. It is rendered in a distinct panel with a PREDICTED
 * badge and can never set a zone state, open an incident, or drive an actuator.
 */
export function predict(
  input: PredictionInput,
  model: PredictionModel = loadModel()
): PredictionResult {
  const vector = buildFeatureVector(input)

  let z = model.intercept
  const contributions: Record<string, number> = {}

  for (const name of FEATURE_NAMES) {
    const contribution = (model.coefficients[name] ?? 0) * vector[name]
    contributions[name] = round3(contribution)
    z += contribution
  }

  const probability = sigmoid(z)

  return {
    probabilityCriticalWithin60s: round3(probability),
    // Confidence in the *decision*, not the class: 0.5 is maximally uncertain.
    confidence: round3(Math.abs(probability - 0.5) * 2),
    featureContributions: contributions,
    modelVersion: model.version,
  }
}

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}
