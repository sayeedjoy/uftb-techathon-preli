import { env } from "./env.js"

/**
 * Priority ranking configuration.
 *
 * Risk answers "how dangerous is this zone?". Priority answers "who do we send
 * security to first?". They are separate scores with separate tuning knobs on
 * purpose — a saturated but empty room can be more dangerous and less urgent
 * than a moderate hazard in a full lab.
 */
export type PriorityConfig = {
  occupancyBonus: number
  /** Upper bound on the time-in-critical term. */
  durationBonusMax: number
  /** Seconds of CRITICAL that earn one point. */
  durationSecondsPerPoint: number
  multiHazardBonus: number
  acknowledgedPenalty: number
  /** Bonus 3: bounded influence of a human-confirmed report. */
  humanReportBonusMax: number
}

export const priorityConfig: PriorityConfig = {
  occupancyBonus: env.PRIORITY_OCCUPANCY_BONUS,
  durationBonusMax: env.PRIORITY_DURATION_BONUS_MAX,
  durationSecondsPerPoint: 6,
  multiHazardBonus: env.PRIORITY_MULTI_HAZARD_BONUS,
  acknowledgedPenalty: env.PRIORITY_ACKNOWLEDGED_PENALTY,
  humanReportBonusMax: env.PRIORITY_HUMAN_REPORT_BONUS_MAX,
}
