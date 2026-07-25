import { beforeEach, describe, expect, it } from "vitest"

import type { RiskConfig } from "../../config/risk.config.js"
import { RecoveryTracker } from "./recovery.service.js"

const config: RiskConfig = {
  weights: { fire: 40, gas: 25, water: 20, occupancy: 15 },
  thresholds: { warning: 30, critical: 65 },
  hysteresis: 5,
  recoveryConsecutiveReadings: 3,
}

describe("RecoveryTracker", () => {
  let tracker: RecoveryTracker

  beforeEach(() => {
    tracker = new RecoveryTracker(config)
  })

  it("does not recover on the first calm reading", () => {
    expect(tracker.push("zone-a", 50)).toBe(false)
  })

  it("recovers on the third consecutive reading below the hysteresis band", () => {
    expect(tracker.push("zone-a", 50)).toBe(false)
    expect(tracker.push("zone-a", 40)).toBe(false)
    expect(tracker.push("zone-a", 30)).toBe(true)
  })

  it("does not count a reading inside the hysteresis band as calm", () => {
    // 60 is exactly the threshold (65 − 5), so it is not yet recovery.
    expect(tracker.push("zone-a", 60)).toBe(false)
    expect(tracker.count("zone-a")).toBe(0)
  })

  it("resets the count when the score climbs back", () => {
    tracker.push("zone-a", 50)
    tracker.push("zone-a", 50)
    tracker.push("zone-a", 66)

    expect(tracker.count("zone-a")).toBe(0)
    expect(tracker.push("zone-a", 50)).toBe(false)
  })

  it("survives an oscillation without ever recovering", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(tracker.push("zone-a", 63)).toBe(false)
      expect(tracker.push("zone-a", 66)).toBe(false)
    }
  })

  it("reports how many calm readings remain", () => {
    tracker.push("zone-a", 10)
    expect(tracker.remaining("zone-a")).toBe(2)
  })

  it("keeps zones independent", () => {
    tracker.push("zone-a", 10)
    tracker.push("zone-a", 10)
    tracker.push("zone-b", 10)

    expect(tracker.push("zone-a", 10)).toBe(true)
    expect(tracker.push("zone-b", 10)).toBe(false)
  })

  it("rehydrates from stored scores", () => {
    tracker.rehydrate("zone-a", [80, 70, 40, 30])
    expect(tracker.count("zone-a")).toBe(2)
  })
})
