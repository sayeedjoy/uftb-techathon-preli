import { RISK_TREND, type RiskTrend } from "@scsrg/shared"

import { env } from "../../config/env.js"
import { riskConfig } from "../../config/risk.config.js"

/**
 * Bonus 1 — short-term risk trend.
 *
 * Advisory only. Trend is computed from accepted risk scores and is displayed
 * beside the state badge, never inside it. It appears nowhere in the risk,
 * incident, priority or actuation code paths — this module exports pure
 * functions and imports nothing from them.
 */
export type TrendResult = {
  trend: RiskTrend
  /** Risk points per second. */
  slope: number
  movingAverage: number
  samples: number
}

export type TrendSample = {
  riskScore: number
  /** Epoch milliseconds. */
  at: number
}

/** Slope below this magnitude is noise, not a direction. */
const STABLE_SLOPE_EPSILON = 0.05

export function computeTrend(
  samples: TrendSample[],
  options: {
    windowSize?: number
    horizonSeconds?: number
    criticalThreshold?: number
  } = {}
): TrendResult {
  const windowSize = options.windowSize ?? env.TREND_WINDOW_READINGS
  const horizonSeconds = options.horizonSeconds ?? env.TREND_HORIZON_S
  const criticalThreshold =
    options.criticalThreshold ?? riskConfig.thresholds.critical

  const window = samples.slice(-windowSize)

  if (window.length === 0) {
    return {
      trend: RISK_TREND.STABLE,
      slope: 0,
      movingAverage: 0,
      samples: 0,
    }
  }

  const movingAverage =
    window.reduce((sum, sample) => sum + sample.riskScore, 0) / window.length

  if (window.length < 3) {
    return {
      trend: RISK_TREND.STABLE,
      slope: 0,
      movingAverage: round2(movingAverage),
      samples: window.length,
    }
  }

  // Least-squares slope over (seconds, riskScore), so the result is a rate
  // rather than a per-reading delta that changes meaning with the interval.
  const baseMs = window[0]?.at ?? 0
  const xs = window.map((sample) => (sample.at - baseMs) / 1000)
  const ys = window.map((sample) => sample.riskScore)

  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] ?? 0) - meanX
    numerator += dx * ((ys[i] ?? 0) - meanY)
    denominator += dx * dx
  }

  const slope = denominator === 0 ? 0 : numerator / denominator
  const latest = window.at(-1)?.riskScore ?? movingAverage

  let trend: RiskTrend
  if (Math.abs(slope) < STABLE_SLOPE_EPSILON) {
    trend = RISK_TREND.STABLE
  } else if (slope < 0) {
    trend = RISK_TREND.FALLING
  } else {
    // Rising *and* projected to cross the critical threshold inside the horizon.
    const projected = latest + slope * horizonSeconds
    trend =
      latest < criticalThreshold && projected >= criticalThreshold
        ? RISK_TREND.TRENDING_CRITICAL
        : RISK_TREND.RISING
  }

  return {
    trend,
    slope: round2(slope),
    movingAverage: round2(movingAverage),
    samples: window.length,
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
