import { beforeEach, describe, expect, it } from "vitest"

import type { SensorConfig } from "../../config/sensor.config.js"
import { createFakeClock } from "../../shared/clock.js"
import { computeRisk } from "../risk-engine/risk.service.js"
import type { RiskConfig } from "../../config/risk.config.js"
import { GasWarmupService } from "./warmup.service.js"
import { OccupancyService } from "./occupancy.service.js"
import { WaterPhaseService } from "./water.service.js"

const sensor: SensorConfig = {
  fireDebounceConsecutive: 5,
  fireClearConsecutive: 5,
  gasWarmupMs: 5_000,
  occupancyDebounceReadings: 3,
  maxFutureTimestampSkewMs: 5_000,
  water: { dryBelow: 0.15, criticalAtOrAbove: 0.6, resetBelow: 0.1 },
}

const risk: RiskConfig = {
  weights: { fire: 40, gas: 25, water: 20, occupancy: 15 },
  thresholds: { warning: 30, critical: 65 },
  hysteresis: 5,
  recoveryConsecutiveReadings: 3,
}

describe("GasWarmupService", () => {
  // A fake clock, never a sleep: timing behaviour must be deterministic.
  let clock: ReturnType<typeof createFakeClock>
  let service: GasWarmupService

  beforeEach(() => {
    clock = createFakeClock(1_000_000)
    service = new GasWarmupService(sensor)
  })

  it("suppresses gas entirely during the window", () => {
    const result = service.evaluate("zone-a", 0.9, clock.nowMs())

    expect(result.suppressed).toBe(true)
    expect(result.effectiveGasLevel).toBe(0)
    expect(result.status).toBe("WARMING_UP")
  })

  it("a saturated gas reading during warm-up cannot reach CRITICAL", () => {
    const warm = service.evaluate("zone-a", 1, clock.nowMs())

    const result = computeRisk(
      {
        fireSignal: 0,
        normalizedGasLevel: warm.effectiveGasLevel,
        normalizedWaterLevel: 0,
        occupancyFactor: 1,
      },
      risk,
      { gasSuppressedByWarmup: warm.suppressed }
    )

    expect(result.riskScore).toBe(15)
    expect(result.state).toBe("SAFE")
  })

  it("the same reading contributes fully once the window expires", () => {
    service.evaluate("zone-a", 0.9, clock.nowMs())
    clock.advance(5_000)

    const warm = service.evaluate("zone-a", 0.9, clock.nowMs())
    const result = computeRisk(
      {
        fireSignal: 0,
        normalizedGasLevel: warm.effectiveGasLevel,
        normalizedWaterLevel: 0,
        occupancyFactor: 0,
      },
      risk
    )

    expect(warm.suppressed).toBe(false)
    expect(result.contributions.gas).toBe(22.5)
  })

  it("reports the remaining time so the reason string can state it", () => {
    service.evaluate("zone-a", 0.5, clock.nowMs())
    clock.advance(1_500)

    expect(service.evaluate("zone-a", 0.5, clock.nowMs()).remainingMs).toBe(
      3_500
    )
  })

  it("restarts the window on reconnection", () => {
    service.evaluate("zone-a", 0.5, clock.nowMs())
    clock.advance(10_000)
    expect(service.evaluate("zone-a", 0.5, clock.nowMs()).suppressed).toBe(
      false
    )

    service.start("zone-a", clock.nowMs())
    expect(service.evaluate("zone-a", 0.5, clock.nowMs()).suppressed).toBe(true)
  })

  it("honours a per-sensor warm-up override", () => {
    const result = service.evaluate("zone-a", 0.5, clock.nowMs(), 30_000)
    expect(result.remainingMs).toBe(30_000)
  })

  it("rehydrates an in-flight window from the stored sensor row", () => {
    const startedAt = new Date(clock.nowMs() - 2_000)
    service.rehydrate("zone-a", startedAt, clock.nowMs())

    expect(service.evaluate("zone-a", 0.5, clock.nowMs()).remainingMs).toBe(
      3_000
    )
  })

  it("restarts the window when the stored start time is unknown", () => {
    service.rehydrate("zone-a", null, clock.nowMs())

    expect(service.evaluate("zone-a", 0.5, clock.nowMs()).suppressed).toBe(true)
  })

  it("keeps zones independent", () => {
    service.evaluate("zone-a", 0.5, clock.nowMs())
    clock.advance(6_000)
    service.evaluate("zone-b", 0.5, clock.nowMs())

    expect(service.hasWarmedUp("zone-a", clock.nowMs())).toBe(true)
    expect(service.hasWarmedUp("zone-b", clock.nowMs())).toBe(false)
  })
})

describe("WaterPhaseService", () => {
  let service: WaterPhaseService

  beforeEach(() => {
    service = new WaterPhaseService(sensor)
  })

  it.each([
    [0, "DRY"],
    [0.14999, "DRY"],
    [0.15, "RISING"],
    [0.59, "RISING"],
    [0.6, "CRITICAL"],
    [1, "CRITICAL"],
  ])("classifies %s as %s", (level, expected) => {
    expect(service.classify("zone-a", level)).toBe(expected)
  })

  it("reports RESET only after the level has risen and receded", () => {
    service.classify("zone-a", 0.4)
    expect(service.classify("zone-a", 0.05)).toBe("RESET")
  })

  it("stays DRY for a probe that never rose", () => {
    service.classify("zone-a", 0.02)
    expect(service.classify("zone-a", 0.03)).toBe("DRY")
  })

  it("does not repeat RESET on subsequent dry readings", () => {
    service.classify("zone-a", 0.7)
    expect(service.classify("zone-a", 0.05)).toBe("RESET")
    expect(service.classify("zone-a", 0.05)).toBe("DRY")
  })

  it("rehydrates from the last stored level", () => {
    service.rehydrate("zone-a", 0.8)
    expect(service.peek("zone-a")).toBe("CRITICAL")
  })
})

describe("OccupancyService", () => {
  let service: OccupancyService

  beforeEach(() => {
    service = new OccupancyService(sensor)
  })

  it("establishes a baseline from the first reading", () => {
    expect(service.evaluate("zone-a", true).occupied).toBe(true)
  })

  it("debounces a brief flip", () => {
    service.evaluate("zone-a", true)
    expect(service.evaluate("zone-a", false).occupied).toBe(true)
    expect(service.evaluate("zone-a", false).occupied).toBe(true)
    expect(service.evaluate("zone-a", false).occupied).toBe(false)
  })

  it("restarts the count when the candidate flips back", () => {
    service.evaluate("zone-a", true)
    service.evaluate("zone-a", false)
    service.evaluate("zone-a", false)
    service.evaluate("zone-a", true)
    service.evaluate("zone-a", false)
    service.evaluate("zone-a", false)

    expect(service.peek("zone-a")).toBe(true)
    expect(service.evaluate("zone-a", false).occupied).toBe(false)
  })

  it("reports UNAVAILABLE — never false — for a disconnected sensor", () => {
    service.evaluate("zone-a", true)
    const result = service.evaluate("zone-a", null)

    expect(result.occupied).toBeNull()
    expect(result.occupied).not.toBe(false)
    expect(result.unavailable).toBe(true)
    expect(result.status).toBe("UNAVAILABLE")
  })

  it("contributes 0 to risk but is treated as occupied for priority", () => {
    const result = service.evaluate("zone-a", undefined)

    expect(result.occupancyFactor).toBe(0)
    expect(result.treatAsOccupiedForPriority).toBe(true)
  })

  it("treats a confirmed empty zone as unoccupied for priority", () => {
    const result = service.evaluate("zone-a", false)

    expect(result.occupied).toBe(false)
    expect(result.treatAsOccupiedForPriority).toBe(false)
  })

  it("rehydrates from stored readings", () => {
    service.rehydrate("zone-a", [
      { occupancyDetected: false },
      { occupancyDetected: true },
      { occupancyDetected: true },
      { occupancyDetected: true },
    ])

    expect(service.peek("zone-a")).toBe(true)
  })

  it("keeps zones independent", () => {
    service.evaluate("zone-a", true)
    service.evaluate("zone-b", false)

    expect(service.peek("zone-a")).toBe(true)
    expect(service.peek("zone-b")).toBe(false)
  })
})
