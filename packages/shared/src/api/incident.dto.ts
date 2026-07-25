import type {
  HazardType,
  IncidentStatus,
  IncidentTimelineEventType,
  ZoneState,
} from "../domain/index.js"
import type { ActuationCommandDto, SensorReadingDto } from "./zone.dto.js"

export type PriorityBreakdown = {
  risk: number
  occupancy: number
  duration: number
  asset: number
  multiHazard: number
  acknowledged: number
  /** Bonus 3 — only a human-confirmed report can make this non-zero. */
  humanReport: number
}

export type PriorityExplanation = {
  priorityScore: number
  breakdown: PriorityBreakdown
  reasons: string[]
}

export type IncidentSummaryDto = {
  id: string
  zoneId: string
  zoneCode: string
  zoneName: string
  status: IncidentStatus
  startedAt: string
  acknowledgedAt: string | null
  acknowledgedByUserId: string | null
  acknowledgedByName: string | null
  resolvedAt: string | null
  durationSeconds: number | null
  maximumRiskScore: number
  currentRiskScore: number
  dominantHazards: HazardType[]
  mainHazard: HazardType | null
  priorityScore: number | null
  createdAt: string
  updatedAt: string
}

export type IncidentTimelineEventDto = {
  id: string
  incidentId: string
  eventType: IncidentTimelineEventType
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type AcknowledgmentDto = {
  id: string
  incidentId: string
  userId: string
  userName: string
  acknowledgedAt: string
  note: string | null
}

export type IncidentDetailDto = IncidentSummaryDto & {
  zoneState: ZoneState
  priorityExplanation: PriorityExplanation | null
  acknowledgment: AcknowledgmentDto | null
  timeline: IncidentTimelineEventDto[]
  actuationCommands: ActuationCommandDto[]
  readings: SensorReadingDto[]
}

export type PriorityQueueEntryDto = {
  rank: number
  incidentId: string
  zoneId: string
  zoneCode: string
  zoneName: string
  status: IncidentStatus
  riskScore: number
  priorityScore: number
  occupancy: "OCCUPIED" | "UNOCCUPIED" | "UNKNOWN"
  criticalDurationSeconds: number
  mainHazard: HazardType | null
  dominantHazards: HazardType[]
  acknowledged: boolean
  acknowledgedByName: string | null
  startedAt: string
  breakdown: PriorityBreakdown
  reasons: string[]
}
