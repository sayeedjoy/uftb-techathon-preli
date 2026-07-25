import type { RiskContributions } from "@scsrg/shared"

import type { RiskConfig } from "../../config/risk.config.js"
import type { RiskExplanationContext, RiskInputs } from "./risk.types.js"

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Turns the numbers into sentences an operator can act on.
 *
 * Pure and deterministic: identical inputs always produce identical strings, so
 * the reasons are snapshot-testable and the UI never has to reconstruct *why* a
 * zone is in its current state.
 */
export function explain(
  inputs: RiskInputs,
  contributions: RiskContributions,
  config: RiskConfig,
  context: RiskExplanationContext = {}
): string[] {
  const reasons: string[] = []

  if (inputs.fireSignal === 1) {
    reasons.push(
      context.fireStreak !== undefined
        ? `Sustained flame confirmed after debounce (${context.fireStreak} consecutive readings) (+${round1(contributions.fire)})`
        : `Sustained flame confirmed after debounce (+${round1(contributions.fire)})`
    )
  } else if (context.fireStreak && context.fireStreak > 0) {
    reasons.push(
      `Flame seen on ${context.fireStreak} reading(s) — below the debounce threshold, contributing 0`
    )
  }

  if (context.gasSuppressedByWarmup) {
    const remaining = context.gasWarmupRemainingMs
    reasons.push(
      remaining !== undefined
        ? `Gas sensor is warming up (${Math.ceil(remaining / 1000)}s remaining) — reading suppressed, contributing 0`
        : "Gas sensor is warming up — reading suppressed, contributing 0"
    )
  } else if (contributions.gas > 0) {
    reasons.push(
      `Gas level is ${percent(inputs.normalizedGasLevel)} of configured range (+${round1(contributions.gas)})`
    )
  }

  if (contributions.water > 0) {
    const phase = context.waterPhase ? `, phase ${context.waterPhase}` : ""
    reasons.push(
      `Water level is ${percent(inputs.normalizedWaterLevel)} of configured range${phase} (+${round1(contributions.water)})`
    )
  } else if (context.waterPhase === "RESET") {
    reasons.push("Water level has receded below the reset threshold")
  }

  if (context.occupancyUnavailable) {
    reasons.push(
      "Occupancy sensor unavailable — not counted toward risk, but treated as occupied for response priority"
    )
  } else if (inputs.occupancyFactor === 1) {
    reasons.push(
      `Zone is currently occupied (+${round1(contributions.occupancy)})`
    )
  }

  for (const missing of context.sensorNotConfigured ?? []) {
    reasons.push(`No ${missing} sensor configured for this zone — contributes 0`)
  }

  if (reasons.length === 0) {
    reasons.push("All monitored signals are within normal range")
  }

  const total =
    contributions.fire +
    contributions.gas +
    contributions.water +
    contributions.occupancy

  if (total >= config.thresholds.critical) {
    reasons.push(
      `Combined score crosses the CRITICAL threshold (${config.thresholds.critical})`
    )
  } else if (total >= config.thresholds.warning) {
    reasons.push(
      `Combined score crosses the WARNING threshold (${config.thresholds.warning})`
    )
  }

  return reasons
}
