import type { SensorReading } from "@prisma/client"
import { ZONE_STATE, type SensorReadingDto } from "@scsrg/shared"

import { findZoneById } from "../modules/zones/zones.repository.js"
import { toZoneSummary } from "../modules/zones/zone.mapper.js"
import { toActuationCommandDto } from "../modules/actuation/actuation.repository.js"
import { findIncidentById } from "../modules/incidents/incident.repository.js"
import { toIncidentSummary } from "../modules/incidents/incident.mapper.js"
import { getPriorityQueue } from "../modules/priority-engine/priority-queue.service.js"
import type { ApplyStateOutcome } from "../modules/zones/zone-state.service.js"
import { emitToDashboard, emitToZone } from "./emitter.js"

function toReadingDto(reading: SensorReading): SensorReadingDto {
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
      typeof reading.contributions === "object" &&
      reading.contributions !== null
        ? (reading.contributions as SensorReadingDto["contributions"])
        : { fire: 0, gas: 0, water: 0, occupancy: 0 },
    reasons: Array.isArray(reading.reasons)
      ? (reading.reasons as string[])
      : [],
    isDuplicate: reading.isDuplicate,
    validationStatus: reading.validationStatus,
  }
}

/**
 * Broadcasts everything one accepted reading produced.
 *
 * Called **after** the ingestion transaction commits, never inside it: a
 * rolled-back transaction must not announce itself, and no socket write should
 * ever hold a database lock open.
 */
export async function publishIngestionOutcome(input: {
  zoneId: string
  reading: SensorReading
  applied: ApplyStateOutcome | null
}): Promise<void> {
  const zone = await findZoneById(input.zoneId)
  if (!zone) return

  const summary = toZoneSummary(zone)
  const readingDto = toReadingDto(input.reading)

  emitToDashboard("reading:accepted", {
    zoneId: zone.id,
    zoneCode: zone.code,
    reading: readingDto,
    result: {
      validationStatus: input.reading.validationStatus,
      appliedToLiveState: input.applied !== null,
    },
  })

  if (!input.applied) {
    // An out-of-order reading is visible in the raw feed but changes nothing.
    return
  }

  emitToDashboard("zone:updated", { zone: summary })
  emitToZone(zone.id, "zone:updated", { zone: summary })

  if (input.applied.stateChanged && input.applied.transitionId) {
    emitToDashboard("zone:state-changed", {
      zone: summary,
      transition: {
        id: input.applied.transitionId,
        zoneId: zone.id,
        previousState: input.applied.previousState,
        newState: input.applied.newState,
        riskScore: summary.currentRiskScore,
        reason: summary.reasons[0] ?? "State recomputed",
        createdAt: new Date().toISOString(),
      },
    })
  }

  for (const command of input.applied.commands) {
    emitToDashboard("actuation:command", {
      command: toActuationCommandDto(command),
    })
  }

  if (input.applied.incidentId) {
    const incident = await findIncidentById(input.applied.incidentId)
    if (incident) {
      const dto = toIncidentSummary(incident)
      if (input.applied.incidentOpened) {
        emitToDashboard("incident:created", { incident: dto })
      } else if (input.applied.incidentResolved) {
        emitToDashboard("incident:resolved", { incident: dto })
      } else {
        emitToDashboard("incident:updated", { incident: dto })
      }
    }
  }

  if (
    input.applied.incidentOpened ||
    input.applied.incidentResolved ||
    input.applied.stateChanged ||
    input.applied.newState === ZONE_STATE.CRITICAL
  ) {
    await publishPriorityQueue()
  }
}

export async function publishPriorityQueue(): Promise<void> {
  const queue = await getPriorityQueue()
  emitToDashboard("priority:updated", { queue })
}

/** Emitted by the heartbeat sweeper when a zone stops reporting. */
export async function publishZoneOffline(zoneId: string): Promise<void> {
  const zone = await findZoneById(zoneId)
  if (!zone) return

  const summary = toZoneSummary(zone)

  emitToDashboard("sensor:offline", {
    zoneId: zone.id,
    zoneCode: zone.code,
    zoneName: zone.name,
    lastSeenAt: zone.lastSeenAt?.toISOString() ?? null,
    sensorType: null,
  })
  emitToDashboard("zone:updated", { zone: summary })
  emitToZone(zone.id, "zone:updated", { zone: summary })
}

export async function publishZoneUpdate(zoneId: string): Promise<void> {
  const zone = await findZoneById(zoneId)
  if (!zone) return
  const summary = toZoneSummary(zone)
  emitToDashboard("zone:updated", { zone: summary })
  emitToZone(zone.id, "zone:updated", { zone: summary })
}

export async function publishIncidentEvent(
  incidentId: string,
  event:
    | "incident:created"
    | "incident:updated"
    | "incident:acknowledged"
    | "incident:resolved"
): Promise<void> {
  const incident = await findIncidentById(incidentId)
  if (!incident) return
  emitToDashboard(event, { incident: toIncidentSummary(incident) })
}
