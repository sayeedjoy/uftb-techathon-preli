import { SENSOR_STATUS, type SensorStatus } from "@scsrg/shared"

import { sensorConfig, type SensorConfig } from "../../config/sensor.config.js"

/**
 * Occupancy debounce.
 *
 * The rule that matters: a disconnected sensor yields `UNAVAILABLE`, **never**
 * `occupancy: false`. "Nobody is here" and "we don't know" are different facts,
 * and conflating them is how a control room decides not to send anyone.
 *
 * Unknown occupancy contributes **0** to risk — the system does not fabricate
 * hazard — but the priority engine treats it as **occupied**, so responder
 * dispatch fails safe. Both halves are stated in the reading's reasons.
 */
export type OccupancyEvaluation = {
  /** Debounced answer. `null` means genuinely unknown. */
  occupied: boolean | null
  /** What the risk engine consumes. Unknown → 0. */
  occupancyFactor: 0 | 1
  /** What the priority engine consumes. Unknown → true (fail safe). */
  treatAsOccupiedForPriority: boolean
  unavailable: boolean
  status: SensorStatus
}

type OccupancyState = {
  /** Last debounced (stable) value. */
  stable: boolean | null
  /** Value currently accumulating consecutive readings. */
  candidate: boolean | null
  candidateCount: number
}

const emptyState = (): OccupancyState => ({
  stable: null,
  candidate: null,
  candidateCount: 0,
})

export class OccupancyService {
  private readonly states = new Map<string, OccupancyState>()

  constructor(private readonly config: SensorConfig = sensorConfig) {}

  /**
   * @param reported `null`/`undefined` means the sensor did not answer.
   */
  evaluate(
    zoneId: string,
    reported: boolean | null | undefined
  ): OccupancyEvaluation {
    if (reported === null || reported === undefined) {
      // Availability is not debounced: one missing answer already means unknown.
      const state = this.states.get(zoneId) ?? emptyState()
      state.candidate = null
      state.candidateCount = 0
      state.stable = null
      this.states.set(zoneId, state)

      return {
        occupied: null,
        occupancyFactor: 0,
        treatAsOccupiedForPriority: true,
        unavailable: true,
        status: SENSOR_STATUS.UNAVAILABLE,
      }
    }

    const state = this.states.get(zoneId) ?? emptyState()

    if (state.candidate === reported) {
      state.candidateCount += 1
    } else {
      state.candidate = reported
      state.candidateCount = 1
    }

    // First ever reading establishes a baseline immediately; afterwards a flip
    // needs N consecutive agreeing readings so a passer-by cannot spam events.
    if (
      state.stable === null ||
      state.candidateCount >= this.config.occupancyDebounceReadings
    ) {
      state.stable = reported
    }

    this.states.set(zoneId, state)

    const occupied = state.stable
    return {
      occupied,
      occupancyFactor: occupied === true ? 1 : 0,
      treatAsOccupiedForPriority: occupied !== false,
      unavailable: false,
      status: SENSOR_STATUS.ONLINE,
    }
  }

  peek(zoneId: string): boolean | null {
    return this.states.get(zoneId)?.stable ?? null
  }

  rehydrate(
    zoneId: string,
    orderedReadings: Array<{ occupancyDetected: boolean | null }>
  ): void {
    this.states.delete(zoneId)
    for (const reading of orderedReadings) {
      this.evaluate(zoneId, reading.occupancyDetected)
    }
  }

  reset(zoneId?: string): void {
    if (zoneId) this.states.delete(zoneId)
    else this.states.clear()
  }
}

export const occupancy = new OccupancyService()
