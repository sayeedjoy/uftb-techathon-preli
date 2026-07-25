import type {
  ActuationStatus,
  ActuationType,
  HazardType,
  LedColor,
  RiskTrend,
  SensorStatus,
  SensorType,
  ValidationStatus,
  WaterPhase,
  ZoneState,
} from "../domain/index.js"

/** Per-signal weighted contribution to the fused risk score. */
export type RiskContributions = {
  fire: number
  gas: number
  water: number
  occupancy: number
}

/** What the backend computed for a reading. Never supplied by a sensor node. */
export type RiskComputation = {
  riskScore: number
  state: ZoneState
  contributions: RiskContributions
  reasons: string[]
}

export type SensorHealthDto = {
  type: SensorType
  name: string
  status: SensorStatus
  isCritical: boolean
  lastSeenAt: string | null
}

/** The simulated actuator picture for one zone. */
export type ActuatorStateDto = {
  led: LedColor
  buzzerActive: boolean
  relayCutoffActive: boolean
  updatedAt: string | null
}

export type ZoneSensorValuesDto = {
  /** Raw flame reading from the latest accepted reading. */
  fireDetected: boolean | null
  /** Debounced 0/1 signal actually fed into the risk engine. */
  fireSignal: 0 | 1
  gasLevel: number | null
  waterLevel: number | null
  waterPhase: WaterPhase | null
  /** `null` means unknown/unavailable — never coerced to `false`. */
  occupancyDetected: boolean | null
}

export type ActiveIncidentSummaryDto = {
  id: string
  status: "OPEN" | "ACKNOWLEDGED"
  startedAt: string
  currentRiskScore: number
  maximumRiskScore: number
  dominantHazards: HazardType[]
  priorityScore: number | null
  acknowledgedAt: string | null
  acknowledgedByName: string | null
}

export type ZoneSummaryDto = {
  id: string
  code: string
  name: string
  description: string | null
  location: string | null
  assetImportance: number
  state: ZoneState
  currentRiskScore: number
  contributions: RiskContributions
  reasons: string[]
  lastSeenAt: string | null
  lastReadingAt: string | null
  isActive: boolean
  maintenanceMode: boolean
  sensors: SensorHealthDto[]
  sensorValues: ZoneSensorValuesDto
  actuators: ActuatorStateDto
  activeIncident: ActiveIncidentSummaryDto | null
  /** Bonus 1 — advisory only, never part of state classification. */
  trend: RiskTrend | null
  trendSlope: number | null
}

export type ZoneConfigurationDto = {
  sensors: Array<{
    id: string
    type: SensorType
    name: string
    status: SensorStatus
    isCritical: boolean
    configuration: Record<string, unknown>
    lastSeenAt: string | null
  }>
  offlineTimeoutMs: number
  gasWarmupMs: number
}

export type ZoneDetailDto = ZoneSummaryDto & {
  configuration: ZoneConfigurationDto
  createdAt: string
  updatedAt: string
}

export type SensorReadingDto = {
  id: string
  readingId: string
  zoneId: string
  sequenceNumber: number
  capturedAt: string
  receivedAt: string
  fireDetected: boolean | null
  gasLevel: number | null
  waterLevel: number | null
  occupancyDetected: boolean | null
  riskScore: number
  calculatedState: ZoneState
  contributions: RiskContributions
  reasons: string[]
  isDuplicate: boolean
  validationStatus: ValidationStatus
}

export type ZoneStateTransitionDto = {
  id: string
  zoneId: string
  previousState: ZoneState | null
  newState: ZoneState
  riskScore: number
  reason: string
  createdAt: string
}

export type ActuationCommandDto = {
  id: string
  zoneId: string
  incidentId: string | null
  type: ActuationType
  payload: Record<string, unknown>
  source: string
  status: ActuationStatus
  requestedAt: string
  executedAt: string | null
}

/** Timeline entry merging state transitions and incident events for a zone. */
export type ZoneTimelineEntryDto = {
  id: string
  kind: "STATE_TRANSITION" | "INCIDENT"
  at: string
  title: string
  detail: string
  state?: ZoneState
  incidentId?: string
}

/** Response body of a successful reading ingestion. */
export type IngestionResultDto = {
  accepted: true
  readingId: string
  zoneId: string
  validationStatus: ValidationStatus
  appliedToLiveState: boolean
  computation: RiskComputation
  zoneState: ZoneState
  incidentId: string | null
  actuationCommandIds: string[]
}
