import { env } from "./env.js"

/**
 * Sensor-processing configuration. Every rule that decides *whether* a signal
 * counts — as opposed to how much it weighs — is tuned from here.
 */
export type SensorConfig = {
  /** Consecutive positive readings needed to confirm flame. */
  fireDebounceConsecutive: number
  /** Consecutive negative readings needed to clear a confirmed flame. */
  fireClearConsecutive: number
  /** Gas contribution is forced to 0 for this long after a sensor comes up. */
  gasWarmupMs: number
  /** Consecutive identical readings needed to flip occupancy. */
  occupancyDebounceReadings: number
  /** How far in the future a `capturedAt` may be before it is rejected. */
  maxFutureTimestampSkewMs: number
  /** Water phase boundaries. */
  water: {
    dryBelow: number
    criticalAtOrAbove: number
    resetBelow: number
  }
}

export const sensorConfig: SensorConfig = {
  fireDebounceConsecutive: env.FIRE_DEBOUNCE_CONSECUTIVE,
  fireClearConsecutive: env.FIRE_CLEAR_CONSECUTIVE,
  gasWarmupMs: env.GAS_WARMUP_MS,
  occupancyDebounceReadings: env.OCCUPANCY_DEBOUNCE_READINGS,
  maxFutureTimestampSkewMs: env.MAX_FUTURE_TIMESTAMP_SKEW_MS,
  water: {
    dryBelow: 0.15,
    criticalAtOrAbove: 0.6,
    resetBelow: 0.1,
  },
}
