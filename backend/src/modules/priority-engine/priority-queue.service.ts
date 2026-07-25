import type { Prisma } from "@prisma/client"
import {
  REPORT_STATUS,
  type HazardType,
  type PriorityQueueEntryDto,
} from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import { priorityConfig } from "../../config/priority.config.js"
import { activeHazardCount } from "../risk-engine/risk.service.js"
import { asContributions } from "./contributions.js"
import { listActiveIncidents } from "../incidents/incident.repository.js"
import { occupancy } from "../ingestion/occupancy.service.js"
import { rankIncidents, type PriorityCandidate } from "./priority.service.js"

/**
 * Recomputes the queue from the database and persists the result.
 *
 * `priorityScore` and `priorityExplanation` are written back onto each incident
 * so the history page can show the ranking exactly as it stood at the time,
 * rather than re-deriving it from data that has since moved on.
 */
export async function recalculatePriorityQueue(
  now = new Date()
): Promise<PriorityQueueEntryDto[]> {
  const incidents = await listActiveIncidents()
  if (incidents.length === 0) return []

  // Bonus 3: only a human-CONFIRMED report can influence priority at all.
  const confirmedReports = await prisma.incidentReport.findMany({
    where: {
      status: REPORT_STATUS.CONFIRMED,
      zoneId: { in: incidents.map((incident) => incident.zoneId) },
    },
    select: { zoneId: true, estimatedSeverity: true },
  })
  const reportSeverityByZone = new Map<string, number>()
  for (const report of confirmedReports) {
    if (!report.zoneId) continue
    reportSeverityByZone.set(
      report.zoneId,
      Math.max(
        reportSeverityByZone.get(report.zoneId) ?? 0,
        report.estimatedSeverity
      )
    )
  }

  const candidates: PriorityCandidate[] = incidents.map((incident) => {
    const contributions = asContributions(incident.zone.contributions)
    const knownOccupancy = occupancy.peek(incident.zoneId)

    return {
      incidentId: incident.id,
      zoneId: incident.zoneId,
      zoneCode: incident.zone.code,
      zoneName: incident.zone.name,
      status: incident.status,
      riskScore: incident.currentRiskScore,
      startedAt: incident.startedAt,
      assetImportance: incident.zone.assetImportance,
      dominantHazards: incident.dominantHazards as HazardType[],
      // Unknown occupancy is treated as occupied so dispatch fails safe.
      occupied: knownOccupancy !== false,
      occupancyKnown: knownOccupancy !== null,
      activeHazardCount: activeHazardCount(contributions),
      ...(reportSeverityByZone.has(incident.zoneId)
        ? { confirmedReportSeverity: reportSeverityByZone.get(incident.zoneId) }
        : {}),
    }
  })

  const ranked = rankIncidents(candidates, now, priorityConfig)

  await prisma.$transaction(
    ranked.map((entry) =>
      prisma.incident.update({
        where: { id: entry.incidentId },
        data: {
          priorityScore: entry.priorityScore,
          priorityExplanation: {
            priorityScore: entry.priorityScore,
            breakdown: entry.breakdown,
            reasons: entry.reasons,
          } as unknown as Prisma.InputJsonValue,
        },
      })
    )
  )

  return ranked.map((entry) => ({
    rank: entry.rank,
    incidentId: entry.incidentId,
    zoneId: entry.zoneId,
    zoneCode: entry.zoneCode,
    zoneName: entry.zoneName,
    status: entry.status,
    riskScore: entry.riskScore,
    priorityScore: entry.priorityScore,
    occupancy: entry.occupancyKnown
      ? entry.occupied
        ? "OCCUPIED"
        : "UNOCCUPIED"
      : "UNKNOWN",
    criticalDurationSeconds: entry.criticalDurationSeconds,
    mainHazard: entry.dominantHazards[0] ?? null,
    dominantHazards: entry.dominantHazards,
    acknowledged: entry.status === "ACKNOWLEDGED",
    acknowledgedByName: null,
    startedAt: entry.startedAt.toISOString(),
    breakdown: entry.breakdown,
    reasons: entry.reasons,
  }))
}

/**
 * Reads the queue for a request.
 *
 * Recomputes rather than trusting the stored score, because the duration term
 * moves with wall-clock time — a queue read a minute later is genuinely a
 * different queue.
 */
export async function getPriorityQueue(): Promise<PriorityQueueEntryDto[]> {
  const queue = await recalculatePriorityQueue()

  if (queue.length === 0) return []

  const acknowledgments = await prisma.acknowledgment.findMany({
    where: { incidentId: { in: queue.map((entry) => entry.incidentId) } },
    include: { user: { select: { name: true } } },
  })
  const nameByIncident = new Map(
    acknowledgments.map((entry) => [entry.incidentId, entry.user.name])
  )

  return queue.map((entry) => ({
    ...entry,
    acknowledgedByName: nameByIncident.get(entry.incidentId) ?? null,
  }))
}
