import { describe, expect, it } from "vitest"

import { computeTrend, type TrendSample } from "./trend.service.js"

const START = 1_700_000_000_000

function series(scores: number[], intervalMs = 1000): TrendSample[] {
  return scores.map((riskScore, index) => ({
    riskScore,
    at: START + index * intervalMs,
  }))
}

const options = { windowSize: 20, horizonSeconds: 60, criticalThreshold: 65 }

describe("computeTrend", () => {
  it("classifies a flat series as STABLE", () => {
    const result = computeTrend(series([20, 20, 20, 20, 20]), options)

    expect(result.trend).toBe("STABLE")
    expect(result.slope).toBe(0)
    expect(result.movingAverage).toBe(20)
  })

  it("classifies a gently rising series as RISING", () => {
    // 0.2 points/s from 11 needs ~270s to reach 65 — well past the horizon.
    const result = computeTrend(series([10, 10.2, 10.4, 10.6, 10.8]), options)

    expect(result.trend).toBe("RISING")
    expect(result.slope).toBeGreaterThan(0)
  })

  it("classifies a falling series as FALLING", () => {
    const result = computeTrend(series([60, 55, 50, 45, 40]), options)

    expect(result.trend).toBe("FALLING")
    expect(result.slope).toBeLessThan(0)
  })

  it("flags TRENDING_CRITICAL when projected to cross inside the horizon", () => {
    // From 40, climbing 1 point/s, the 65 threshold is 25s away.
    const result = computeTrend(series([35, 36, 37, 38, 39, 40]), options)

    expect(result.trend).toBe("TRENDING_CRITICAL")
  })

  it("does not flag TRENDING_CRITICAL when the crossing is beyond the horizon", () => {
    // 0.1 points/s from 20 needs 450s to reach 65 — well past a 60s horizon.
    const result = computeTrend(
      series([20, 20.1, 20.2, 20.3, 20.4, 20.5], 1000),
      options
    )

    expect(result.trend).toBe("RISING")
  })

  it("does not flag TRENDING_CRITICAL for a zone already critical", () => {
    const result = computeTrend(series([70, 72, 74, 76, 78]), options)

    expect(result.trend).toBe("RISING")
  })

  it("treats a noisy but level series as STABLE", () => {
    const result = computeTrend(
      series([30, 32, 29, 31, 30, 32, 29, 31, 30]),
      options
    )

    expect(result.trend).toBe("STABLE")
  })

  it("handles an empty series without dividing by zero", () => {
    const result = computeTrend([], options)

    expect(result.trend).toBe("STABLE")
    expect(result.samples).toBe(0)
    expect(Number.isNaN(result.slope)).toBe(false)
  })

  it("does not infer a direction from fewer than three samples", () => {
    expect(computeTrend(series([10, 90]), options).trend).toBe("STABLE")
  })

  it("only considers the most recent window", () => {
    const long = series([...Array(50).fill(10), 12, 14, 16, 18, 20])
    const result = computeTrend(long, { ...options, windowSize: 5 })

    expect(result.samples).toBe(5)
    expect(result.movingAverage).toBe(16)
  })

  it("reports a rate per second, independent of the reading interval", () => {
    const fast = computeTrend(series([10, 12, 14, 16, 18], 1000), options)
    const slow = computeTrend(series([10, 12, 14, 16, 18], 2000), options)

    expect(fast.slope).toBeCloseTo(2, 5)
    expect(slow.slope).toBeCloseTo(1, 5)
  })
})
