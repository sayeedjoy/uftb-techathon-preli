import { describe, expect, it } from "vitest"

import type { RiskConfig } from "../../config/risk.config.js"
import {
  activeHazardCount,
  classify,
  clamp01,
  computeRisk,
  dominantHazards,
  round2,
} from "./risk.service.js"
import type { RiskInputs } from "./risk.types.js"

/** Config is injected everywhere so the engine is provably pure. */
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

describe("computeRisk", () => {
  it("returns 0 / SAFE when nothing is happening", () => {
    const result = computeRisk(inputs(), config)

    expect(result.riskScore).toBe(0)
    expect(result.state).toBe("SAFE")
    expect(result.contributions).toEqual({
      fire: 0,
      gas: 0,
      water: 0,
      occupancy: 0,
    })
    expect(result.reasons).toContain(
      "All monitored signals are within normal range"
    )
  })

  it("returns 100 / CRITICAL when every signal is maxed", () => {
    const result = computeRisk(
      inputs({
        fireSignal: 1,
        normalizedGasLevel: 1,
        normalizedWaterLevel: 1,
        occupancyFactor: 1,
      }),
      config
    )

    expect(result.riskScore).toBe(100)
    expect(result.state).toBe("CRITICAL")
  })

  it("reproduces the specification's worked example exactly", () => {
    // Fire confirmed + gas at 70% + occupied → 40 + 17.5 + 0 + 15 = 72.5
    const result = computeRisk(
      inputs({
        fireSignal: 1,
        normalizedGasLevel: 0.7,
        occupancyFactor: 1,
      }),
      config,
      { fireStreak: 5 }
    )

    expect(result.riskScore).toBe(72.5)
    expect(result.state).toBe("CRITICAL")
    expect(result.contributions).toEqual({
      fire: 40,
      gas: 17.5,
      water: 0,
      occupancy: 15,
    })
    expect(result.reasons).toEqual([
      "Sustained flame confirmed after debounce (5 consecutive readings) (+40)",
      "Gas level is 70% of configured range (+17.5)",
      "Zone is currently occupied (+15)",
      "Combined score crosses the CRITICAL threshold (65)",
    ])
  })

  it("clamps an out-of-range gas value defensively", () => {
    const high = computeRisk(inputs({ normalizedGasLevel: 5 }), config)
    const low = computeRisk(inputs({ normalizedGasLevel: -3 }), config)

    expect(high.contributions.gas).toBe(25)
    expect(high.riskScore).toBeLessThanOrEqual(100)
    expect(low.contributions.gas).toBe(0)
    expect(low.riskScore).toBeGreaterThanOrEqual(0)
  })

  it("treats NaN as absent rather than propagating it", () => {
    const result = computeRisk(
      inputs({ normalizedWaterLevel: Number.NaN }),
      config
    )

    expect(Number.isNaN(result.riskScore)).toBe(false)
    expect(result.riskScore).toBe(0)
  })

  it("never exceeds 100 even with inflated weights", () => {
    const inflated: RiskConfig = {
      ...config,
      weights: { fire: 90, gas: 80, water: 70, occupancy: 60 },
    }
    const result = computeRisk(
      inputs({
        fireSignal: 1,
        normalizedGasLevel: 1,
        normalizedWaterLevel: 1,
        occupancyFactor: 1,
      }),
      inflated
    )

    expect(result.riskScore).toBe(100)
  })

  it("is pure — the same inputs always produce the same output", () => {
    const args = inputs({ fireSignal: 1, normalizedGasLevel: 0.42 })
    const first = computeRisk(args, config, { fireStreak: 5 })
    const second = computeRisk(args, config, { fireStreak: 5 })

    expect(second).toEqual(first)
  })
})

describe("classification boundaries", () => {
  it.each([
    [0, "SAFE"],
    [29.99, "SAFE"],
    [30, "WARNING"],
    [64.99, "WARNING"],
    [65, "CRITICAL"],
    [100, "CRITICAL"],
  ])("classifies %s as %s", (score, expected) => {
    expect(classify(score, config.thresholds)).toBe(expected)
  })

  it("puts a score of exactly the warning threshold into WARNING", () => {
    // occupancy 15 + water 0.75 * 20 = 15 → total 30
    const result = computeRisk(
      inputs({ occupancyFactor: 1, normalizedWaterLevel: 0.75 }),
      config
    )

    expect(result.riskScore).toBe(30)
    expect(result.state).toBe("WARNING")
  })

  it("puts a score just below the warning threshold into SAFE", () => {
    // occupancy 15 + water 0.7495 * 20 = 14.99 → 29.99
    const result = computeRisk(
      inputs({ occupancyFactor: 1, normalizedWaterLevel: 0.7495 }),
      config
    )

    expect(result.riskScore).toBe(29.99)
    expect(result.state).toBe("SAFE")
  })

  it("puts a score of exactly the critical threshold into CRITICAL", () => {
    // fire 40 + gas 1.0 * 25 = 25 → 65 exactly
    const result = computeRisk(
      inputs({ fireSignal: 1, normalizedGasLevel: 1 }),
      config
    )

    expect(result.riskScore).toBe(65)
    expect(result.state).toBe("CRITICAL")
  })

  it("puts a score just below the critical threshold into WARNING", () => {
    // fire 40 + gas 0.9996 * 25 = 24.99 → 64.99
    const result = computeRisk(
      inputs({ fireSignal: 1, normalizedGasLevel: 0.9996 }),
      config
    )

    expect(result.riskScore).toBe(64.99)
    expect(result.state).toBe("WARNING")
  })
})

describe("proportionality", () => {
  it.each([
    [0, 0],
    [0.25, 6.25],
    [0.5, 12.5],
    [0.75, 18.75],
    [1, 25],
  ])("gas at %s contributes %s", (level, expected) => {
    expect(
      computeRisk(inputs({ normalizedGasLevel: level }), config).contributions
        .gas
    ).toBe(expected)
  })

  it.each([
    [0, 0],
    [0.25, 5],
    [0.5, 10],
    [0.75, 15],
    [1, 20],
  ])("water at %s contributes %s", (level, expected) => {
    expect(
      computeRisk(inputs({ normalizedWaterLevel: level }), config).contributions
        .water
    ).toBe(expected)
  })

  it("occupancy alone never leaves SAFE — people multiply severity, they are not a hazard", () => {
    const result = computeRisk(inputs({ occupancyFactor: 1 }), config)

    expect(result.riskScore).toBe(15)
    expect(result.state).toBe("SAFE")
  })
})

describe("multi-hazard combinations", () => {
  it("fire + gas at full scale is exactly CRITICAL", () => {
    const result = computeRisk(
      inputs({ fireSignal: 1, normalizedGasLevel: 1 }),
      config
    )
    expect(result.riskScore).toBe(65)
    expect(result.state).toBe("CRITICAL")
  })

  it("fire + full water stops just short of CRITICAL without a third signal", () => {
    const result = computeRisk(
      inputs({ fireSignal: 1, normalizedWaterLevel: 1 }),
      config
    )
    expect(result.riskScore).toBe(60)
    expect(result.state).toBe("WARNING")
  })

  it("fire + water + occupancy crosses into CRITICAL", () => {
    const result = computeRisk(
      inputs({ fireSignal: 1, normalizedWaterLevel: 1, occupancyFactor: 1 }),
      config
    )
    expect(result.riskScore).toBe(75)
    expect(result.state).toBe("CRITICAL")
  })

  it("saturated gas with occupancy stays WARNING without flame", () => {
    // Evacuate-and-ventilate, not cut-the-power: 25 + 15 = 40.
    const result = computeRisk(
      inputs({ normalizedGasLevel: 1, occupancyFactor: 1 }),
      config
    )

    expect(result.riskScore).toBe(40)
    expect(result.state).toBe("WARNING")
  })

  it("gas + water + occupancy stays WARNING without flame — no cutoff without fire", () => {
    const result = computeRisk(
      inputs({
        normalizedGasLevel: 1,
        normalizedWaterLevel: 1,
        occupancyFactor: 1,
      }),
      config
    )

    expect(result.riskScore).toBe(60)
    expect(result.state).toBe("WARNING")
  })

  it("fire alone reaches WARNING but not CRITICAL", () => {
    const result = computeRisk(inputs({ fireSignal: 1 }), config)

    expect(result.riskScore).toBe(40)
    expect(result.state).toBe("WARNING")
  })
})

describe("hazard helpers", () => {
  it("orders dominant hazards by contribution", () => {
    expect(
      dominantHazards({ fire: 40, gas: 17.5, water: 0, occupancy: 15 })
    ).toEqual(["FIRE", "GAS", "OCCUPANCY"])
  })

  it("returns an empty list when nothing contributes", () => {
    expect(
      dominantHazards({ fire: 0, gas: 0, water: 0, occupancy: 0 })
    ).toEqual([])
  })

  it("counts hazard signals excluding occupancy", () => {
    expect(
      activeHazardCount({ fire: 40, gas: 5, water: 0, occupancy: 15 })
    ).toBe(2)
    expect(
      activeHazardCount({ fire: 0, gas: 0, water: 0, occupancy: 15 })
    ).toBe(0)
  })
})

describe("numeric helpers", () => {
  it("clamps to the unit interval", () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(2)).toBe(1)
  })

  it("rounds to two decimals without floating-point drift", () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(17.499999999)).toBe(17.5)
  })
})
