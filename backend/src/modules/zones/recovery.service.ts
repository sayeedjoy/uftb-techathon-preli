import { recoveryThreshold, riskConfig, type RiskConfig } from "../../config/risk.config.js"

/**
 * Recovery hysteresis.
 *
 * Leaving CRITICAL requires the score to sit below `critical − hysteresis` for
 * N consecutive accepted readings. Without this, a score oscillating around 65
 * would thrash the incident lifecycle and the relay — opening and closing an
 * incident several times a second during exactly the moment an operator needs
 * a stable picture.
 *
 * Counters are per zone and rebuildable from stored readings.
 */
export class RecoveryTracker {
  private readonly counters = new Map<string, number>()

  constructor(private readonly config: RiskConfig = riskConfig) {}

  /**
   * Records one accepted reading.
   * @returns true when the zone has met the recovery condition.
   */
  push(zoneId: string, riskScore: number): boolean {
    const threshold = recoveryThreshold(this.config)

    if (riskScore >= threshold) {
      this.counters.set(zoneId, 0)
      return false
    }

    const next = (this.counters.get(zoneId) ?? 0) + 1
    this.counters.set(zoneId, next)
    return next >= this.config.recoveryConsecutiveReadings
  }

  count(zoneId: string): number {
    return this.counters.get(zoneId) ?? 0
  }

  /** How many more consecutive calm readings are needed. */
  remaining(zoneId: string): number {
    return Math.max(
      0,
      this.config.recoveryConsecutiveReadings - this.count(zoneId)
    )
  }

  rehydrate(zoneId: string, orderedScores: number[]): void {
    this.counters.set(zoneId, 0)
    for (const score of orderedScores) {
      this.push(zoneId, score)
    }
  }

  reset(zoneId?: string): void {
    if (zoneId) this.counters.delete(zoneId)
    else this.counters.clear()
  }
}

export const recoveryTracker = new RecoveryTracker()
