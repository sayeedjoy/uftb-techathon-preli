import { ZONE_STATE, type RiskContributions, type ZoneState } from "@scsrg/shared"

import { riskConfig, type RiskConfig } from "../../config/risk.config.js"
import { explain } from "./explain.js"
import type {
  RiskExplanationContext,
  RiskInputs,
  RiskResult,
} from "./risk.types.js"

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Classifies a fused score into a zone state.
 *
 * OFFLINE is deliberately absent: it is a connectivity fact, not a score, and
 * is applied by the zone-state service *after* classification. A score can
 * never make a zone OFFLINE, and OFFLINE is never inferred as SAFE.
 */
export function classify(
  score: number,
  thresholds: RiskConfig["thresholds"]
): Exclude<ZoneState, "OFFLINE"> {
  if (score >= thresholds.critical) return ZONE_STATE.CRITICAL
  if (score >= thresholds.warning) return ZONE_STATE.WARNING
  return ZONE_STATE.SAFE
}

/**
 * Fuses debounced sensor signals into a 0..100 risk score.
 *
 * Pure: no clock, no I/O, no Prisma. Weights and thresholds arrive via config
 * so they can be tuned per deployment without touching this function. Inputs
 * are clamped defensively even though validation should have rejected an
 * out-of-range value upstream — a bad number must never produce a score above
 * 100 or below 0.
 */
export function computeRisk(
  inputs: RiskInputs,
  config: RiskConfig = riskConfig,
  context: RiskExplanationContext = {}
): RiskResult {
  const fireSignal = inputs.fireSignal === 1 ? 1 : 0
  const occupancyFactor = inputs.occupancyFactor === 1 ? 1 : 0
  const gas = clamp01(inputs.normalizedGasLevel)
  const water = clamp01(inputs.normalizedWaterLevel)

  const contributions: RiskContributions = {
    fire: round2(config.weights.fire * fireSignal),
    gas: round2(config.weights.gas * gas),
    water: round2(config.weights.water * water),
    occupancy: round2(config.weights.occupancy * occupancyFactor),
  }

  const riskScore = round2(
    clamp(
      contributions.fire +
        contributions.gas +
        contributions.water +
        contributions.occupancy,
      0,
      100
    )
  )

  const normalizedInputs: RiskInputs = {
    fireSignal: fireSignal as 0 | 1,
    normalizedGasLevel: gas,
    normalizedWaterLevel: water,
    occupancyFactor: occupancyFactor as 0 | 1,
  }

  return {
    riskScore,
    state: classify(riskScore, config.thresholds),
    contributions,
    reasons: explain(normalizedInputs, contributions, config, context),
  }
}

/**
 * Ranks the active hazards by contribution, largest first.
 * Used for the incident's `dominantHazards` and the "main hazard" column.
 */
export function dominantHazards(
  contributions: RiskContributions
): Array<"FIRE" | "GAS" | "WATER" | "OCCUPANCY"> {
  return (
    [
      ["FIRE", contributions.fire],
      ["GAS", contributions.gas],
      ["WATER", contributions.water],
      ["OCCUPANCY", contributions.occupancy],
    ] as const
  )
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([hazard]) => hazard)
}

/** ≥2 active hazard signals — feeds the priority engine's multi-hazard bonus. */
export function activeHazardCount(contributions: RiskContributions): number {
  return [
    contributions.fire,
    contributions.gas,
    contributions.water,
  ].filter((value) => value > 0).length
}
