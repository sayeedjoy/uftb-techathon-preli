import { SENSOR_STATUS, type SensorStatus } from "@scsrg/shared"

import { sensorConfig, type SensorConfig } from "../../config/sensor.config.js"

/**
 * Gas warm-up gate.
 *
 * A metal-oxide gas sensor reads high for its first seconds of life; treating
 * that as hazard would fire an incident every time a node reboots. During the
 * window the gas contribution is forced to 0, the sensor reports `WARMING_UP`,
 * and gas can raise neither state nor an incident. The suppression is always
 * stated in the reading's reasons — it is never silent.
 */
export type WarmupEvaluation = {
  /** The value the risk engine should use — 0 while warming up. */
  effectiveGasLevel: number
  suppressed: boolean
  remainingMs: number
  status: SensorStatus
}

export class GasWarmupService {
  /** zoneId → epoch ms at which the current warm-up window began. */
  private readonly startedAt = new Map<string, number>()

  constructor(private readonly config: SensorConfig = sensorConfig) {}

  /** Starts (or restarts) the window — used on boot and on reconnection. */
  start(zoneId: string, nowMs: number): void {
    this.startedAt.set(zoneId, nowMs)
  }

  /** True once the sensor has warmed up (or was never warming). */
  private isExpired(zoneId: string, nowMs: number): boolean {
    const started = this.startedAt.get(zoneId)
    if (started === undefined) return true
    return nowMs - started >= this.config.gasWarmupMs
  }

  /**
   * Evaluates one gas reading. The first reading after a boot or reconnection
   * implicitly opens the window.
   */
  evaluate(
    zoneId: string,
    rawGasLevel: number,
    nowMs: number,
    warmupMsOverride?: number
  ): WarmupEvaluation {
    const windowMs = warmupMsOverride ?? this.config.gasWarmupMs

    if (!this.startedAt.has(zoneId)) {
      this.startedAt.set(zoneId, nowMs)
    }

    const started = this.startedAt.get(zoneId) ?? nowMs
    const elapsed = nowMs - started
    const remainingMs = Math.max(0, windowMs - elapsed)
    const suppressed = remainingMs > 0

    return {
      effectiveGasLevel: suppressed ? 0 : rawGasLevel,
      suppressed,
      remainingMs,
      status: suppressed ? SENSOR_STATUS.WARMING_UP : SENSOR_STATUS.ONLINE,
    }
  }

  /** Restores the window from the sensor row written before the restart. */
  rehydrate(zoneId: string, warmupStartedAt: Date | null, nowMs: number): void {
    if (warmupStartedAt === null) {
      // Unknown history: restart the window rather than trusting an untested
      // sensor. Being conservative here costs a few seconds, never an alarm.
      this.startedAt.set(zoneId, nowMs)
      return
    }
    this.startedAt.set(zoneId, warmupStartedAt.getTime())
  }

  warmupStartedAt(zoneId: string): number | null {
    return this.startedAt.get(zoneId) ?? null
  }

  hasWarmedUp(zoneId: string, nowMs: number): boolean {
    return this.isExpired(zoneId, nowMs)
  }

  reset(zoneId?: string): void {
    if (zoneId) this.startedAt.delete(zoneId)
    else this.startedAt.clear()
  }
}

export const gasWarmup = new GasWarmupService()
