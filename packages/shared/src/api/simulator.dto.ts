import type { HazardType, ReportStatus, RiskTrend } from "../domain/index.js"

export type SimulatorZoneStateDto = {
  zoneId: string
  zoneCode: string
  zoneName: string
  running: boolean
  intervalMs: number
  fireDetected: boolean
  gasLevel: number
  waterLevel: number
  occupancyDetected: boolean
  /** Sensor-level disconnection: the zone still reports, that sensor does not. */
  disconnectedSensors: string[]
  /** Zone-level network cut: nothing is sent at all, driving OFFLINE. */
  networkDisconnected: boolean
  warmupMode: boolean
  sequenceNumber: number
  hasCredential: boolean
  lastStatusCode: number | null
  sentCount: number
  acceptedCount: number
  rejectedCount: number
}

export type SimulatorStatusDto = {
  zones: SimulatorZoneStateDto[]
  activeScenario: {
    id: number
    name: string
    startedAt: string
    progress: number
    finished: boolean
  } | null
  scenarios: SimulatorScenarioDto[]
}

export type SimulatorScenarioDto = {
  id: number
  name: string
  description: string
  demonstrates: string
  estimatedDurationMs: number
}

export type SimulatorPayloadEventDto = {
  zoneId: string
  zoneCode: string
  /** The raw body actually POSTed to the ingestion API. */
  payload: unknown
  sentAt: string
}

export type SimulatorResponseEventDto = {
  zoneId: string
  zoneCode: string
  statusCode: number
  /** The backend's verbatim response — the simulator never masks a rejection. */
  body: unknown
  receivedAt: string
  latencyMs: number
}

export type ScenarioRunResultDto = {
  scenarioId: number
  name: string
  passed: boolean
  startedAt: string
  finishedAt: string
  assertions: Array<{
    description: string
    passed: boolean
    detail: string
  }>
}

/** Bonus 1 payload. */
export type TrendDto = {
  zoneId: string
  zoneCode: string
  trend: RiskTrend
  slope: number
  movingAverage: number
  samples: number[]
  updatedAt: string
}

/** Bonus 2 payload — advisory, never able to actuate. */
export type PredictionDto = {
  zoneId: string
  zoneCode: string
  probabilityCriticalWithin60s: number
  confidence: number
  featureContributions: Record<string, number>
  modelVersion: string
  predictedAt: string
}

/** Bonus 3 payload. */
export type IncidentReportDto = {
  id: string
  userId: string
  userName: string
  rawText: string
  zoneId: string | null
  zoneCode: string | null
  hazardType: HazardType | null
  estimatedSeverity: number
  confidence: number
  confirmationMessage: string
  status: ReportStatus
  extractorProvider: string
  createdAt: string
  confirmedAt: string | null
}
