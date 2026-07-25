import type {
  ActuationCommandDto,
  IngestionResultDto,
  SensorReadingDto,
  ZoneStateTransitionDto,
  ZoneSummaryDto,
} from "../api/zone.dto.js"
import type {
  IncidentSummaryDto,
  PriorityQueueEntryDto,
} from "../api/incident.dto.js"
import type {
  SystemEventDto,
  SystemHealthRollupDto,
} from "../api/dashboard.dto.js"
import type {
  IncidentReportDto,
  PredictionDto,
  SimulatorPayloadEventDto,
  SimulatorResponseEventDto,
  SimulatorStatusDto,
  TrendDto,
} from "../api/simulator.dto.js"

/**
 * Stamped onto every server → client payload.
 *
 * `eventId` powers the client's bounded LRU de-duplication and `emittedAt`
 * lets the client suppress notifications for events that predate the current
 * connection — together these make reconnect de-duplication a property of the
 * transport rather than something each toast site has to remember.
 */
export type EventEnvelope = {
  eventId: string
  emittedAt: string
}

export type WithEnvelope<T> = T & EventEnvelope

export type ZoneUpdatedPayload = { zone: ZoneSummaryDto }
export type ZoneStateChangedPayload = {
  zone: ZoneSummaryDto
  transition: ZoneStateTransitionDto
}
export type IncidentPayload = { incident: IncidentSummaryDto }
export type PriorityUpdatedPayload = { queue: PriorityQueueEntryDto[] }
export type SensorOfflinePayload = {
  zoneId: string
  zoneCode: string
  zoneName: string
  lastSeenAt: string | null
  sensorType: string | null
}
export type SystemHealthPayload = {
  health: SystemHealthRollupDto
  event?: SystemEventDto
}
export type ActuationCommandPayload = { command: ActuationCommandDto }
export type ReadingAcceptedPayload = {
  zoneId: string
  zoneCode: string
  reading: SensorReadingDto
  result: Pick<IngestionResultDto, "validationStatus" | "appliedToLiveState">
}

export type ServerToClientEvents = {
  "zone:updated": (payload: WithEnvelope<ZoneUpdatedPayload>) => void
  "zone:state-changed": (payload: WithEnvelope<ZoneStateChangedPayload>) => void
  "reading:accepted": (payload: WithEnvelope<ReadingAcceptedPayload>) => void
  "incident:created": (payload: WithEnvelope<IncidentPayload>) => void
  "incident:updated": (payload: WithEnvelope<IncidentPayload>) => void
  "incident:acknowledged": (payload: WithEnvelope<IncidentPayload>) => void
  "incident:resolved": (payload: WithEnvelope<IncidentPayload>) => void
  "priority:updated": (payload: WithEnvelope<PriorityUpdatedPayload>) => void
  "sensor:offline": (payload: WithEnvelope<SensorOfflinePayload>) => void
  "system:health": (payload: WithEnvelope<SystemHealthPayload>) => void
  "actuation:command": (payload: WithEnvelope<ActuationCommandPayload>) => void
  "simulator:payload": (
    payload: WithEnvelope<SimulatorPayloadEventDto>
  ) => void
  "simulator:response": (
    payload: WithEnvelope<SimulatorResponseEventDto>
  ) => void
  "simulator:status": (payload: WithEnvelope<SimulatorStatusDto>) => void
  "trend:updated": (payload: WithEnvelope<TrendDto>) => void
  "prediction:updated": (payload: WithEnvelope<PredictionDto>) => void
  "report:created": (
    payload: WithEnvelope<{ report: IncidentReportDto }>
  ) => void
}

export type ClientToServerEvents = {
  "zone:subscribe": (zoneId: string) => void
  "zone:unsubscribe": (zoneId: string) => void
}

export type ServerToClientEventName = keyof ServerToClientEvents

export const SERVER_EVENT_NAMES = [
  "zone:updated",
  "zone:state-changed",
  "reading:accepted",
  "incident:created",
  "incident:updated",
  "incident:acknowledged",
  "incident:resolved",
  "priority:updated",
  "sensor:offline",
  "system:health",
  "actuation:command",
  "simulator:payload",
  "simulator:response",
  "simulator:status",
  "trend:updated",
  "prediction:updated",
  "report:created",
] as const satisfies readonly ServerToClientEventName[]

export const SOCKET_ROOM = {
  dashboard: "dashboard",
  admin: "admin",
  zone: (zoneId: string) => `zone:${zoneId}`,
} as const
