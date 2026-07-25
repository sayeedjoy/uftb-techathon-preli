import { beforeEach, describe, expect, it } from "vitest"

import type { SensorConfig } from "../../config/sensor.config.js"
import { FireDebounceService } from "./debounce.service.js"

const config: SensorConfig = {
  fireDebounceConsecutive: 5,
  fireClearConsecutive: 5,
  gasWarmupMs: 5_000,
  occupancyDebounceReadings: 3,
  maxFutureTimestampSkewMs: 5_000,
  water: { dryBelow: 0.15, criticalAtOrAbove: 0.6, resetBelow: 0.1 },
}

describe("FireDebounceService", () => {
  let service: FireDebounceService

  beforeEach(() => {
    service = new FireDebounceService(config)
  })

  it("does not confirm before the threshold", () => {
    for (let i = 0; i < 4; i += 1) {
      expect(service.push("zone-a", true).signal).toBe(0)
    }
  })

  it("confirms exactly on the fifth consecutive positive", () => {
    for (let i = 0; i < 4; i += 1) service.push("zone-a", true)

    const fifth = service.push("zone-a", true)

    expect(fifth.signal).toBe(1)
    expect(fifth.positiveStreak).toBe(5)
  })

  it("resets the counter when a negative interrupts the streak", () => {
    service.push("zone-a", true)
    service.push("zone-a", true)
    service.push("zone-a", false)
    service.push("zone-a", true)
    service.push("zone-a", true)
    service.push("zone-a", true)
    service.push("zone-a", true)

    // Only four positives since the interruption.
    expect(service.peek("zone-a").signal).toBe(0)
    expect(service.push("zone-a", true).signal).toBe(1)
  })

  it("keeps the alarm on through four negatives and clears on the fifth", () => {
    for (let i = 0; i < 5; i += 1) service.push("zone-a", true)
    expect(service.peek("zone-a").signal).toBe(1)

    for (let i = 0; i < 4; i += 1) {
      expect(service.push("zone-a", false).signal).toBe(1)
    }

    expect(service.push("zone-a", false).signal).toBe(0)
  })

  it("restarts the clear count if flame reappears mid-recovery", () => {
    for (let i = 0; i < 5; i += 1) service.push("zone-a", true)
    for (let i = 0; i < 4; i += 1) service.push("zone-a", false)

    service.push("zone-a", true)
    for (let i = 0; i < 4; i += 1) {
      expect(service.push("zone-a", false).signal).toBe(1)
    }
    expect(service.push("zone-a", false).signal).toBe(0)
  })

  it("keeps zones independent when their readings interleave", () => {
    for (let i = 0; i < 5; i += 1) {
      service.push("zone-a", true)
      service.push("zone-b", false)
    }

    expect(service.peek("zone-a").signal).toBe(1)
    expect(service.peek("zone-b").signal).toBe(0)
  })

  it("honours an asymmetric configuration", () => {
    const fast = new FireDebounceService({
      ...config,
      fireDebounceConsecutive: 2,
      fireClearConsecutive: 8,
    })

    fast.push("z", true)
    expect(fast.push("z", true).signal).toBe(1)

    for (let i = 0; i < 7; i += 1) {
      expect(fast.push("z", false).signal).toBe(1)
    }
    expect(fast.push("z", false).signal).toBe(0)
  })

  it("rebuilds counters from stored readings after a restart", () => {
    const readings = Array.from({ length: 5 }, () => ({ fireDetected: true }))

    const state = service.rehydrate("zone-a", readings)

    expect(state.signal).toBe(1)
    expect(state.positiveStreak).toBe(5)
  })

  it("ignores readings that did not report flame at all when rehydrating", () => {
    const readings = [
      { fireDetected: true },
      { fireDetected: null },
      { fireDetected: true },
      { fireDetected: true },
      { fireDetected: true },
      { fireDetected: true },
    ]

    // A missing value is not evidence of absence, so the streak survives it.
    expect(service.rehydrate("zone-a", readings).signal).toBe(1)
  })

  it("clears state on reset", () => {
    for (let i = 0; i < 5; i += 1) service.push("zone-a", true)
    service.reset("zone-a")

    expect(service.peek("zone-a").signal).toBe(0)
  })
})
