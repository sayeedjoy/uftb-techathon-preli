import { describe, expect, it } from "vitest"

import type { RiskConfig } from "../../config/risk.config.js"
import { explain } from "./explain.js"
import type { RiskInputs } from "./risk.types.js"

const config: RiskConfig = {
  weights: { fire: 40, gas: 25, water: 20, occupancy: 15 },
  thresholds: { warning: 30, critical: 65 },
  hysteresis: 5,
  recoveryConsecutiveReadings: 3,
}

function inputs(overrides: Partial<RiskInputs> = {}): RiskInputs {
  return {
    fireSignal: 0,
    normalizedGasLevel: 0,
    normalizedWaterLevel: 0,
    occupancyFactor: 0,
    ...overrides,
  }
}

describe("explain", () => {
  it("states that a sub-threshold flicker contributed nothing", () => {
    const reasons = explain(
      inputs(),
      { fire: 0, gas: 0, water: 0, occupancy: 0 },
      config,
      { fireStreak: 3 }
    )

    expect(reasons[0]).toBe(
      "Flame seen on 3 reading(s) — below the debounce threshold, contributing 0"
    )
  })

  it("names warm-up suppression explicitly, with the time remaining", () => {
    const reasons = explain(
      inputs({ normalizedGasLevel: 0.9 }),
      { fire: 0, gas: 0, water: 0, occupancy: 0 },
      config,
      { gasSuppressedByWarmup: true, gasWarmupRemainingMs: 3200 }
    )

    expect(reasons).toContain(
      "Gas sensor is warming up (4s remaining) — reading suppressed, contributing 0"
    )
    expect(reasons.join(" ")).not.toContain("90% of configured range")
  })

  it("distinguishes unavailable occupancy from unoccupied", () => {
    const reasons = explain(
      inputs(),
      { fire: 0, gas: 0, water: 0, occupancy: 0 },
      config,
      { occupancyUnavailable: true }
    )

    expect(reasons).toContain(
      "Occupancy sensor unavailable — not counted toward risk, but treated as occupied for response priority"
    )
  })

  it("mentions the water phase alongside the level", () => {
    const reasons = explain(
      inputs({ normalizedWaterLevel: 0.65 }),
      { fire: 0, gas: 0, water: 13, occupancy: 0 },
      config,
      { waterPhase: "CRITICAL" }
    )

    expect(reasons).toContain(
      "Water level is 65% of configured range, phase CRITICAL (+13)"
    )
  })

  it("notes sensors the zone does not have", () => {
    const reasons = explain(
      inputs(),
      { fire: 0, gas: 0, water: 0, occupancy: 0 },
      config,
      { sensorNotConfigured: ["water"] }
    )

    expect(reasons).toContain(
      "No water sensor configured for this zone — contributes 0"
    )
  })

  it("appends the threshold crossing that produced the state", () => {
    const critical = explain(
      inputs({ fireSignal: 1, normalizedGasLevel: 1 }),
      { fire: 40, gas: 25, water: 0, occupancy: 0 },
      config
    )
    const warning = explain(
      inputs({ fireSignal: 1 }),
      { fire: 40, gas: 0, water: 0, occupancy: 0 },
      config
    )

    expect(critical.at(-1)).toBe(
      "Combined score crosses the CRITICAL threshold (65)"
    )
    expect(warning.at(-1)).toBe(
      "Combined score crosses the WARNING threshold (30)"
    )
  })

  it("is deterministic for identical inputs", () => {
    const args = [
      inputs({ fireSignal: 1, normalizedGasLevel: 0.4 }),
      { fire: 40, gas: 10, water: 0, occupancy: 0 },
      config,
      { fireStreak: 5 },
    ] as const

    expect(explain(...args)).toEqual(explain(...args))
  })
})
