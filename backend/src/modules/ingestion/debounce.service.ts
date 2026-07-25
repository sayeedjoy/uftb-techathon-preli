import { sensorConfig, type SensorConfig } from "../../config/sensor.config.js"

/**
 * Fire debounce with **asymmetric** hysteresis.
 *
 * Confirming takes N consecutive positives so a flicker cannot raise an alarm.
 * Clearing takes N consecutive negatives so a momentary sensor dropout during a
 * real fire cannot silence one. Those two rules are deliberately not symmetric:
 * the cost of a missed fire is not the cost of a spurious one.
 *
 * State lives in a per-zone map that is fully rebuildable from stored readings
 * (`rehydrate`), so it is a cache, never the only copy.
 */
export type FireDebounceState = {
  /** Consecutive positives seen since the last negative. */
  positiveStreak: number
  /** Consecutive negatives seen since the last positive. */
  negativeStreak: number
  /** The debounced output actually fed to the risk engine. */
  signal: 0 | 1
}

const emptyState = (): FireDebounceState => ({
  positiveStreak: 0,
  negativeStreak: 0,
  signal: 0,
})

export class FireDebounceService {
  private readonly states = new Map<string, FireDebounceState>()

  constructor(private readonly config: SensorConfig = sensorConfig) {}

  /**
   * Feeds one raw flame reading for a zone and returns the debounced signal.
   * Counters are per zone — one zone's flicker can never affect another.
   */
  push(zoneId: string, fireDetected: boolean): FireDebounceState {
    const state = this.states.get(zoneId) ?? emptyState()

    if (fireDetected) {
      state.positiveStreak += 1
      state.negativeStreak = 0
      if (state.positiveStreak >= this.config.fireDebounceConsecutive) {
        state.signal = 1
      }
    } else {
      state.negativeStreak += 1
      state.positiveStreak = 0
      if (state.negativeStreak >= this.config.fireClearConsecutive) {
        state.signal = 0
      }
    }

    this.states.set(zoneId, state)
    return { ...state }
  }

  peek(zoneId: string): FireDebounceState {
    return { ...(this.states.get(zoneId) ?? emptyState()) }
  }

  /**
   * Rebuilds a zone's counters from its stored readings (oldest → newest).
   * Called at boot so a restart mid-fire does not reset the confirmation.
   */
  rehydrate(
    zoneId: string,
    orderedReadings: Array<{ fireDetected: boolean | null }>
  ): FireDebounceState {
    this.states.delete(zoneId)
    for (const reading of orderedReadings) {
      // A reading that did not report flame at all is not evidence of absence.
      if (reading.fireDetected === null || reading.fireDetected === undefined) {
        continue
      }
      this.push(zoneId, reading.fireDetected)
    }
    return this.peek(zoneId)
  }

  reset(zoneId?: string): void {
    if (zoneId) this.states.delete(zoneId)
    else this.states.clear()
  }
}

/** Process-wide instance used by the ingestion pipeline. */
export const fireDebounce = new FireDebounceService()
