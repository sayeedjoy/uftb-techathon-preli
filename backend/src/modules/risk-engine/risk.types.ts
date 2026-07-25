import type { RiskContributions, ZoneState } from "@scsrg/shared"

/**
 * Everything the risk engine needs, already debounced and gated by the
 * ingestion layer. The engine itself makes no decisions about *whether* a
 * signal counts — only about how much it contributes.
 */
export type RiskInputs = {
  /** 0 or 1 — the debounced fire signal, not the raw sensor reading. */
  fireSignal: 0 | 1
  /** 0..1 — already forced to 0 if the gas sensor is inside its warm-up. */
  normalizedGasLevel: number
  /** 0..1 */
  normalizedWaterLevel: number
  /** 0 or 1 — 0 when occupancy is unknown; the system never invents hazard. */
  occupancyFactor: 0 | 1
}

/** Context used only to phrase the explanation; never changes the arithmetic. */
export type RiskExplanationContext = {
  /** Raw consecutive-positive count behind `fireSignal`. */
  fireStreak?: number
  gasSuppressedByWarmup?: boolean
  gasWarmupRemainingMs?: number
  occupancyUnavailable?: boolean
  waterPhase?: "DRY" | "RISING" | "CRITICAL" | "RESET"
  sensorNotConfigured?: Array<"fire" | "gas" | "water" | "occupancy">
}

export type RiskResult = {
  riskScore: number
  state: ZoneState
  contributions: RiskContributions
  reasons: string[]
}
