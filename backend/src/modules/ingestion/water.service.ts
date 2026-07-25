import { WATER_PHASE, type WaterPhase } from "@scsrg/shared"

import { sensorConfig, type SensorConfig } from "../../config/sensor.config.js"

/**
 * Water-level phase derivation.
 *
 * The phase is a presentation and hazard-classification concept layered over
 * the same normalised 0..1 value the risk engine weighs — it never changes the
 * arithmetic. `RESET` is reported only when the level *falls back* below the
 * reset threshold after having risen, so a permanently dry probe reads `DRY`.
 */
export class WaterPhaseService {
  private readonly lastPhase = new Map<string, WaterPhase>()

  constructor(private readonly config: SensorConfig = sensorConfig) {}

  classify(zoneId: string, level: number): WaterPhase {
    const previous = this.lastPhase.get(zoneId)
    const { dryBelow, criticalAtOrAbove, resetBelow } = this.config.water

    let phase: WaterPhase
    if (level >= criticalAtOrAbove) {
      phase = WATER_PHASE.CRITICAL
    } else if (level >= dryBelow) {
      phase = WATER_PHASE.RISING
    } else if (
      level < resetBelow &&
      previous !== undefined &&
      previous !== WATER_PHASE.DRY &&
      previous !== WATER_PHASE.RESET
    ) {
      phase = WATER_PHASE.RESET
    } else {
      phase = WATER_PHASE.DRY
    }

    this.lastPhase.set(zoneId, phase)
    return phase
  }

  peek(zoneId: string): WaterPhase | null {
    return this.lastPhase.get(zoneId) ?? null
  }

  rehydrate(zoneId: string, lastLevel: number | null): void {
    this.lastPhase.delete(zoneId)
    if (lastLevel !== null) {
      this.classify(zoneId, lastLevel)
    }
  }

  reset(zoneId?: string): void {
    if (zoneId) this.lastPhase.delete(zoneId)
    else this.lastPhase.clear()
  }
}

export const waterPhase = new WaterPhaseService()
