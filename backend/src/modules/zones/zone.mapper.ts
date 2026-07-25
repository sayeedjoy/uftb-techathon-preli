import type { Sensor } from "@prisma/client"
import type {
  ActiveIncidentSummaryDto,
  HazardType,
  RiskContributions,
  SensorHealthDto,
  ZoneDetailDto,
  ZoneSummaryDto,
} from "@scsrg/shared"

import { env } from "../../config/env.js"
import { fireDebounce } from "../ingestion/debounce.service.js"
import { waterPhase } from "../ingestion/water.service.js"
import type { ZoneWithRelations } from "./zones.repository.js"

const EMPTY_CONTRIBUTIONS: RiskContributions = {
  fire: 0,
  gas: 0,
  water: 0,
  occupancy: 0,
}

function asContributions(value: unknown): RiskContributions {
  if (typeof value !== "object" || value === null) return EMPTY_CONTRIBUTIONS
  const record = value as Record<string, unknown>
  const read = (key: string): number =>
    typeof record[key] === "number" ? (record[key] as number) : 0
  return {
    fire: read("fire"),
    gas: read("gas"),
    water: read("water"),
    occupancy: read("occupancy"),
  }
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

function toSensorHealth(sensor: Sensor): SensorHealthDto {
  return {
    type: sensor.type,
    name: sensor.name,
    status: sensor.status,
    isCritical: sensor.isCritical,
    lastSeenAt: sensor.lastSeenAt?.toISOString() ?? null,
  }
}

function toActiveIncident(
  zone: ZoneWithRelations
): ActiveIncidentSummaryDto | null {
  const incident = zone.incidents[0]
  if (!incident) return null

  return {
    id: incident.id,
    status: incident.status === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "OPEN",
    startedAt: incident.startedAt.toISOString(),
    currentRiskScore: incident.currentRiskScore,
    maximumRiskScore: incident.maximumRiskScore,
    dominantHazards: incident.dominantHazards as HazardType[],
    priorityScore: incident.priorityScore,
    acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByName: incident.acknowledgment?.user.name ?? null,
  }
}

/**
 * Projects a zone row into the wire shape.
 *
 * The subtle part is `sensorValues`: `occupancyDetected: null` means *unknown*,
 * and the UI is required to render it as "Unavailable" rather than "Clear".
 * Collapsing null to false here would defeat that at the source.
 */
export function toZoneSummary(zone: ZoneWithRelations): ZoneSummaryDto {
  const latest = zone.readings[0] ?? null

  return {
    id: zone.id,
    code: zone.code,
    name: zone.name,
    description: zone.description,
    location: zone.location,
    assetImportance: zone.assetImportance,
    state: zone.state,
    currentRiskScore: zone.currentRiskScore,
    contributions: asContributions(zone.contributions),
    reasons: asStringArray(zone.reasons),
    lastSeenAt: zone.lastSeenAt?.toISOString() ?? null,
    lastReadingAt: zone.lastReadingAt?.toISOString() ?? null,
    isActive: zone.isActive,
    maintenanceMode: zone.maintenanceMode,
    sensors: zone.sensors.map(toSensorHealth),
    sensorValues: {
      fireDetected: latest?.fireDetected ?? null,
      fireSignal: fireDebounce.peek(zone.id).signal,
      gasLevel: latest?.gasLevel ?? null,
      waterLevel: latest?.waterLevel ?? null,
      waterPhase: waterPhase.peek(zone.id),
      occupancyDetected: latest?.occupancyDetected ?? null,
    },
    actuators: {
      led: zone.ledColor,
      buzzerActive: zone.buzzerActive,
      relayCutoffActive: zone.relayCutoffActive,
      updatedAt: zone.actuatorsUpdatedAt?.toISOString() ?? null,
    },
    activeIncident: toActiveIncident(zone),
    trend: zone.trend,
    trendSlope: zone.trendSlope,
  }
}

export function toZoneDetail(zone: ZoneWithRelations): ZoneDetailDto {
  return {
    ...toZoneSummary(zone),
    configuration: {
      sensors: zone.sensors.map((sensor) => ({
        id: sensor.id,
        type: sensor.type,
        name: sensor.name,
        status: sensor.status,
        isCritical: sensor.isCritical,
        configuration:
          typeof sensor.configuration === "object" &&
          sensor.configuration !== null
            ? (sensor.configuration as Record<string, unknown>)
            : {},
        lastSeenAt: sensor.lastSeenAt?.toISOString() ?? null,
      })),
      offlineTimeoutMs: env.ZONE_OFFLINE_TIMEOUT_MS,
      gasWarmupMs: env.GAS_WARMUP_MS,
    },
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  }
}
