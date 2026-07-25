import type {
  HazardType,
  IncidentSummaryDto,
  PriorityExplanation,
} from "@scsrg/shared"

import type { IncidentWithRelations } from "./incident.repository.js"

function durationSeconds(
  startedAt: Date,
  resolvedAt: Date | null
): number | null {
  if (!resolvedAt) return null
  return Math.max(0, Math.floor((resolvedAt.getTime() - startedAt.getTime()) / 1000))
}

export function asPriorityExplanation(
  value: unknown
): PriorityExplanation | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  if (
    typeof record.priorityScore !== "number" ||
    typeof record.breakdown !== "object" ||
    !Array.isArray(record.reasons)
  ) {
    return null
  }
  return value as PriorityExplanation
}

export function toIncidentSummary(
  incident: IncidentWithRelations
): IncidentSummaryDto {
  const hazards = incident.dominantHazards as HazardType[]

  return {
    id: incident.id,
    zoneId: incident.zoneId,
    zoneCode: incident.zone.code,
    zoneName: incident.zone.name,
    status: incident.status,
    startedAt: incident.startedAt.toISOString(),
    acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: incident.acknowledgment?.userId ?? null,
    acknowledgedByName: incident.acknowledgment?.user.name ?? null,
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    durationSeconds: durationSeconds(incident.startedAt, incident.resolvedAt),
    maximumRiskScore: incident.maximumRiskScore,
    currentRiskScore: incident.currentRiskScore,
    dominantHazards: hazards,
    mainHazard: hazards[0] ?? null,
    priorityScore: incident.priorityScore,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  }
}
