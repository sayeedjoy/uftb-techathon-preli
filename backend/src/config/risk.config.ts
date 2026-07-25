import { env } from "./env.js"

/**
 * Risk fusion configuration.
 *
 * Weights and thresholds live here — never inline in the engine — so a
 * deployment can be retuned without touching the calculation, and so the unit
 * tests can inject a different config to prove the engine is genuinely pure.
 */
export type RiskConfig = {
  weights: {
    fire: number
    gas: number
    water: number
    occupancy: number
  }
  thresholds: {
    warning: number
    critical: number
  }
  /** Leaving CRITICAL requires score < critical − hysteresis … */
  hysteresis: number
  /** … for this many consecutive accepted readings. */
  recoveryConsecutiveReadings: number
}

export const riskConfig: RiskConfig = {
  weights: {
    fire: env.RISK_WEIGHT_FIRE,
    gas: env.RISK_WEIGHT_GAS,
    water: env.RISK_WEIGHT_WATER,
    occupancy: env.RISK_WEIGHT_OCCUPANCY,
  },
  thresholds: {
    warning: env.RISK_THRESHOLD_WARNING,
    critical: env.RISK_THRESHOLD_CRITICAL,
  },
  hysteresis: env.STATE_HYSTERESIS,
  recoveryConsecutiveReadings: env.RECOVERY_CONSECUTIVE_READINGS,
}

/** Score below which a CRITICAL zone is allowed to start recovering. */
export function recoveryThreshold(config: RiskConfig = riskConfig): number {
  return config.thresholds.critical - config.hysteresis
}
