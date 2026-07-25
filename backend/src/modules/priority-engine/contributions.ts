import type { RiskContributions } from "@scsrg/shared"

const EMPTY: RiskContributions = { fire: 0, gas: 0, water: 0, occupancy: 0 }

/**
 * Coerces a stored `contributions` JSON blob into a usable shape.
 *
 * The column is JSON, so anything could be in there — an older schema, a
 * hand-edited row, `null`. Reading it defensively means a malformed blob
 * degrades one zone's multi-hazard bonus instead of throwing inside the
 * priority recalculation and taking the whole queue down.
 */
export function asContributions(value: unknown): RiskContributions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...EMPTY }
  }

  const record = value as Record<string, unknown>
  const read = (key: keyof RiskContributions): number => {
    const entry = record[key]
    return typeof entry === "number" && Number.isFinite(entry) ? entry : 0
  }

  return {
    fire: read("fire"),
    gas: read("gas"),
    water: read("water"),
    occupancy: read("occupancy"),
  }
}
