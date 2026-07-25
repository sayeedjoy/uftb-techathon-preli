import type {
  SensorReadingDto,
  ZoneDetailDto,
  ZoneStateTransitionDto,
  ZoneSummaryDto,
  ZoneTimelineEntryDto,
} from "@scsrg/shared"
import type { SensorReading } from "@prisma/client"

import { NotFoundError } from "../../shared/errors.js"
import { prisma } from "../../database/prisma.js"
import {
  findZoneByIdOrCode,
  listTransitions,
  listZones,
} from "./zones.repository.js"
import { toZoneDetail, toZoneSummary } from "./zone.mapper.js"
import { listReadings } from "../ingestion/reading.repository.js"

export async function getAllZoneStatuses(
  includeInactive = false
): Promise<ZoneSummaryDto[]> {
  const zones = await listZones({ includeInactive })
  return zones.map(toZoneSummary)
}

export async function getZoneDetail(identifier: string): Promise<ZoneDetailDto> {
  const zone = await findZoneByIdOrCode(identifier)
  if (!zone) throw new NotFoundError("Zone not found.")
  return toZoneDetail(zone)
}

export async function resolveZoneOrThrow(identifier: string) {
  const zone = await findZoneByIdOrCode(identifier)
  if (!zone) throw new NotFoundError("Zone not found.")
  return zone
}

export function toReadingDto(reading: SensorReading): SensorReadingDto {
  return {
    id: reading.id,
    readingId: reading.readingId,
    zoneId: reading.zoneId,
    sequenceNumber: reading.sequenceNumber,
    capturedAt: reading.capturedAt.toISOString(),
    receivedAt: reading.receivedAt.toISOString(),
    fireDetected: reading.fireDetected,
    gasLevel: reading.gasLevel,
    waterLevel: reading.waterLevel,
    occupancyDetected: reading.occupancyDetected,
    riskScore: reading.riskScore,
    calculatedState: reading.calculatedState,
    contributions:
      typeof reading.contributions === "object" && reading.contributions !== null
        ? (reading.contributions as SensorReadingDto["contributions"])
        : { fire: 0, gas: 0, water: 0, occupancy: 0 },
    reasons: Array.isArray(reading.reasons) ? (reading.reasons as string[]) : [],
    isDuplicate: reading.isDuplicate,
    validationStatus: reading.validationStatus,
  }
}

export async function getZoneReadings(
  identifier: string,
  options: { page: number; pageSize: number; from?: Date; to?: Date }
): Promise<{ readings: SensorReadingDto[]; total: number }> {
  const zone = await resolveZoneOrThrow(identifier)
  const [rows, total] = await listReadings(zone.id, {
    skip: (options.page - 1) * options.pageSize,
    take: options.pageSize,
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
  })

  return { readings: rows.map(toReadingDto), total }
}

export async function getZoneTransitions(
  identifier: string
): Promise<ZoneStateTransitionDto[]> {
  const zone = await resolveZoneOrThrow(identifier)
  const rows = await listTransitions(zone.id)

  return rows.map((row) => ({
    id: row.id,
    zoneId: row.zoneId,
    previousState: row.previousState,
    newState: row.newState,
    riskScore: row.riskScore,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * Merges state transitions and incidents into a single ordered narrative — the
 * question an operator actually asks is "what happened in this room?", not
 * "what happened in this table?".
 */
export async function getZoneTimeline(
  identifier: string
): Promise<ZoneTimelineEntryDto[]> {
  const zone = await resolveZoneOrThrow(identifier)

  const [transitions, incidents] = await Promise.all([
    listTransitions(zone.id, 200),
    prisma.incident.findMany({
      where: { zoneId: zone.id },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
  ])

  const entries: ZoneTimelineEntryDto[] = [
    ...transitions.map((transition) => ({
      id: transition.id,
      kind: "STATE_TRANSITION" as const,
      at: transition.createdAt.toISOString(),
      title: `${transition.previousState ?? "—"} → ${transition.newState}`,
      detail: transition.reason,
      state: transition.newState,
    })),
    ...incidents.map((incident) => ({
      id: incident.id,
      kind: "INCIDENT" as const,
      at: incident.startedAt.toISOString(),
      title: `Incident ${incident.status.toLowerCase()}`,
      detail: `Peak risk ${incident.maximumRiskScore}, hazards: ${
        incident.dominantHazards.join(", ") || "none recorded"
      }`,
      incidentId: incident.id,
    })),
  ]

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
