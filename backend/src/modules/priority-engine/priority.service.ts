import {
  INCIDENT_STATUS,
  type HazardType,
  type IncidentStatus,
  type PriorityBreakdown,
  type PriorityExplanation,
} from "@scsrg/shared"

import {
  priorityConfig,
  type PriorityConfig,
} from "../../config/priority.config.js"

/** Everything the ranking needs, with no database types in sight. */
export type PriorityCandidate = {
  incidentId: string
  zoneId: string
  zoneCode: string
  zoneName: string
  status: IncidentStatus
  riskScore: number
  startedAt: Date
  assetImportance: number
  dominantHazards: HazardType[]
  /**
   * `true` when the zone is occupied **or** occupancy is unknown.
   * Unknown counts as occupied here so dispatch fails safe, even though the
   * same unknown contributes 0 to the risk score.
   */
  occupied: boolean
  occupancyKnown: boolean
  /** Number of distinct hazard signals currently active (excluding occupancy). */
  activeHazardCount: number
  /** Bonus 3: severity 1–5 of a *human-confirmed* report, if any. */
  confirmedReportSeverity?: number
}

export type RankedIncident = PriorityCandidate & {
  rank: number
  priorityScore: number
  breakdown: PriorityBreakdown
  reasons: string[]
  criticalDurationSeconds: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Scores one active incident.
 *
 * Pure: `now` and config are injected, so a duration term is testable without
 * touching a clock. Every term is surfaced in `breakdown` and narrated in
 * `reasons`, because the dashboard has to make rank 1 vs rank 2 legible without
 * the operator opening a detail view.
 */
export function computePriority(
  candidate: PriorityCandidate,
  now: Date,
  config: PriorityConfig = priorityConfig
): PriorityExplanation & { criticalDurationSeconds: number } {
  const criticalDurationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - candidate.startedAt.getTime()) / 1000)
  )

  const occupancy = candidate.occupied ? config.occupancyBonus : 0
  const duration = Math.min(
    config.durationBonusMax,
    Math.floor(criticalDurationSeconds / config.durationSecondsPerPoint)
  )
  const asset = candidate.assetImportance
  const multiHazard =
    candidate.activeHazardCount >= 2 ? config.multiHazardBonus : 0
  const acknowledged =
    candidate.status === INCIDENT_STATUS.ACKNOWLEDGED
      ? -config.acknowledgedPenalty
      : 0
  const humanReport = candidate.confirmedReportSeverity
    ? Math.min(
        config.humanReportBonusMax,
        Math.max(0, candidate.confirmedReportSeverity)
      )
    : 0

  const breakdown: PriorityBreakdown = {
    risk: round2(candidate.riskScore),
    occupancy,
    duration,
    asset,
    multiHazard,
    acknowledged,
    humanReport,
  }

  const priorityScore = round2(
    breakdown.risk +
      breakdown.occupancy +
      breakdown.duration +
      breakdown.asset +
      breakdown.multiHazard +
      breakdown.acknowledged +
      breakdown.humanReport
  )

  return {
    priorityScore,
    breakdown,
    reasons: explainPriority(candidate, breakdown, criticalDurationSeconds),
    criticalDurationSeconds,
  }
}

function explainPriority(
  candidate: PriorityCandidate,
  breakdown: PriorityBreakdown,
  durationSeconds: number
): string[] {
  const reasons: string[] = [`Live risk score ${breakdown.risk}`]

  if (breakdown.occupancy > 0) {
    reasons.push(
      candidate.occupancyKnown
        ? `Zone is occupied (+${breakdown.occupancy})`
        : `Occupancy unknown — treated as occupied so dispatch fails safe (+${breakdown.occupancy})`
    )
  } else {
    reasons.push("Zone is confirmed empty (+0)")
  }

  if (breakdown.multiHazard > 0) {
    reasons.push(
      `Confirmed ${candidate.dominantHazards.slice(0, 2).join(" and ").toLowerCase()} hazards (+${breakdown.multiHazard})`
    )
  }

  if (breakdown.duration > 0) {
    reasons.push(
      `Critical for ${durationSeconds} seconds (+${breakdown.duration})`
    )
  }

  if (breakdown.asset > 0) {
    reasons.push(
      `High-value zone, asset importance ${candidate.assetImportance} (+${breakdown.asset})`
    )
  }

  if (breakdown.humanReport > 0) {
    reasons.push(
      `Confirmed human report of this hazard (+${breakdown.humanReport})`
    )
  }

  if (breakdown.acknowledged < 0) {
    reasons.push(
      `Already acknowledged — responders are en route (${breakdown.acknowledged})`
    )
  }

  return reasons
}

/**
 * Ranks every active incident.
 *
 * The comparator chain — priorityScore DESC → riskScore DESC → startedAt ASC →
 * incidentId ASC — is a **total order**, so identical inputs in any arrival
 * order always produce a byte-identical ranking. That determinism is the whole
 * point: two operators looking at two screens must see the same rank 1.
 */
export function rankIncidents(
  candidates: PriorityCandidate[],
  now: Date,
  config: PriorityConfig = priorityConfig
): RankedIncident[] {
  const scored = candidates.map((candidate) => {
    const { priorityScore, breakdown, reasons, criticalDurationSeconds } =
      computePriority(candidate, now, config)
    return {
      ...candidate,
      rank: 0,
      priorityScore,
      breakdown,
      reasons,
      criticalDurationSeconds,
    }
  })

  scored.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore
    }
    if (b.riskScore !== a.riskScore) {
      return b.riskScore - a.riskScore
    }
    const startDelta = a.startedAt.getTime() - b.startedAt.getTime()
    if (startDelta !== 0) return startDelta
    return a.incidentId < b.incidentId
      ? -1
      : a.incidentId > b.incidentId
        ? 1
        : 0
  })

  return scored.map((entry, index) => ({ ...entry, rank: index + 1 }))
}
