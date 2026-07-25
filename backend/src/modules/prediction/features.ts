/**
 * Bonus 2 — feature engineering for the predicted-risk model.
 *
 * This module and everything under `modules/prediction/` import **nothing**
 * from the actuation, incident or zone-state services. That boundary is the
 * safety property: a prediction can never reach a relay. An architecture test
 * asserts it mechanically rather than trusting this comment.
 */

export const FEATURE_NAMES = [
  "currentRisk",
  "fireStreak",
  "gasSlope",
  "waterSlope",
  "occupancy",
  "secondsSinceTransition",
  "assetImportance",
] as const

export type FeatureName = (typeof FEATURE_NAMES)[number]
export type FeatureVector = Record<FeatureName, number>

export type PredictionInput = {
  currentRisk: number
  /** Consecutive positive flame readings. */
  fireStreak: number
  /** Gas level change per second over the recent window. */
  gasSlope: number
  waterSlope: number
  /** 1 when occupied or unknown, 0 when confirmed empty. */
  occupancy: 0 | 1
  secondsSinceTransition: number
  assetImportance: number
}

/**
 * Scales each feature into roughly [0, 1] so a single learning rate suits them
 * all and the coefficients stay comparable to one another.
 */
export function buildFeatureVector(input: PredictionInput): FeatureVector {
  return {
    currentRisk: clamp01(input.currentRisk / 100),
    fireStreak: clamp01(input.fireStreak / 10),
    gasSlope: clamp(input.gasSlope, -1, 1),
    waterSlope: clamp(input.waterSlope, -1, 1),
    occupancy: input.occupancy,
    secondsSinceTransition: clamp01(input.secondsSinceTransition / 300),
    assetImportance: clamp01(input.assetImportance / 8),
  }
}

export function toArray(vector: FeatureVector): number[] {
  return FEATURE_NAMES.map((name) => vector[name])
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
