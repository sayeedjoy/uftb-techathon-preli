import type {
  SystemEventSeverity,
  SystemEventType,
  UserRole,
  ZoneState,
} from "../domain/index.js"
import type { PriorityQueueEntryDto } from "./incident.dto.js"

export type AuthUserDto = {
  id: string
  name: string
  email: string
  role: UserRole
  createdAt: string
}

export type LoginResponseDto = {
  token: string
  expiresIn: string
  user: AuthUserDto
}

export type ZoneStateCounts = Record<ZoneState, number>

export type SystemHealthRollupDto = {
  backendStatus: "OK" | "DEGRADED"
  databaseConnected: boolean
  socketConnections: number
  offlineZoneCount: number
  failedActuationCount: number
  recentValidationFailureCount: number
}

export type DashboardSummaryDto = {
  serverTime: string
  totalZones: number
  connectedZones: number
  stateCounts: ZoneStateCounts
  activeIncidents: number
  unacknowledgedIncidents: number
  offlineZones: number
  highestPriorityIncident: PriorityQueueEntryDto | null
  health: SystemHealthRollupDto
}

export type SystemEventDto = {
  id: string
  zoneId: string | null
  zoneCode: string | null
  sensorId: string | null
  type: SystemEventType
  severity: SystemEventSeverity
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type ZoneConnectivityDto = {
  zoneId: string
  zoneCode: string
  zoneName: string
  state: ZoneState
  lastSeenAt: string | null
  lastReadingAt: string | null
  secondsSinceLastSeen: number | null
  isOffline: boolean
  sensors: Array<{
    id: string
    type: string
    status: string
    lastSeenAt: string | null
  }>
}

export type SystemHealthDto = {
  backendStatus: "OK" | "DEGRADED"
  uptimeSeconds: number
  databaseConnected: boolean
  databaseLatencyMs: number | null
  socketConnections: number
  zones: ZoneConnectivityDto[]
  offlineZones: ZoneConnectivityDto[]
  failedActuationCommands: Array<{
    id: string
    zoneId: string
    zoneCode: string
    type: string
    status: string
    requestedAt: string
  }>
  recentValidationFailures: SystemEventDto[]
  recentSystemEvents: SystemEventDto[]
}

export type AuditLogDto = {
  id: string
  userId: string | null
  userName: string | null
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

export type ManualOverrideDto = {
  id: string
  zoneId: string
  zoneCode: string
  userId: string
  userName: string
  action: string
  reason: string
  metadata: Record<string, unknown>
  createdAt: string
}
