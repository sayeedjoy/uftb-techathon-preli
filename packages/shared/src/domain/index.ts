/**
 * Domain primitives shared by the backend and the frontend.
 *
 * Every enum is exported twice: as a frozen const object (so runtime code can
 * iterate or validate) and as a union type (so the compiler can exhaustively
 * check). The names must stay identical to the Prisma enum members — a mismatch
 * is caught by `pnpm typecheck` at the repository root.
 */

export const ZONE_STATE = {
  SAFE: "SAFE",
  WARNING: "WARNING",
  CRITICAL: "CRITICAL",
  OFFLINE: "OFFLINE",
} as const
export type ZoneState = (typeof ZONE_STATE)[keyof typeof ZONE_STATE]
export const ZONE_STATES = Object.values(ZONE_STATE) as readonly ZoneState[]

export const INCIDENT_STATUS = {
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
} as const
export type IncidentStatus =
  (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS]
export const INCIDENT_STATUSES = Object.values(
  INCIDENT_STATUS
) as readonly IncidentStatus[]

/** Statuses that count as "active" — the partial unique index keys off these. */
export const ACTIVE_INCIDENT_STATUSES = [
  INCIDENT_STATUS.OPEN,
  INCIDENT_STATUS.ACKNOWLEDGED,
] as const

export const USER_ROLE = {
  SECURITY_STAFF: "SECURITY_STAFF",
  ADMIN: "ADMIN",
} as const
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE]
export const USER_ROLES = Object.values(USER_ROLE) as readonly UserRole[]

export const ACTUATION_TYPE = {
  SET_LED: "SET_LED",
  ACTIVATE_BUZZER: "ACTIVATE_BUZZER",
  DEACTIVATE_BUZZER: "DEACTIVATE_BUZZER",
  ACTIVATE_RELAY: "ACTIVATE_RELAY",
  DEACTIVATE_RELAY: "DEACTIVATE_RELAY",
} as const
export type ActuationType = (typeof ACTUATION_TYPE)[keyof typeof ACTUATION_TYPE]
export const ACTUATION_TYPES = Object.values(
  ACTUATION_TYPE
) as readonly ActuationType[]

export const ACTUATION_SOURCE = {
  SENSOR_TRIGGERED: "SENSOR_TRIGGERED",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  SYSTEM_RECOVERY: "SYSTEM_RECOVERY",
} as const
export type ActuationSource =
  (typeof ACTUATION_SOURCE)[keyof typeof ACTUATION_SOURCE]

export const ACTUATION_STATUS = {
  PENDING: "PENDING",
  DISPATCHED: "DISPATCHED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
} as const
export type ActuationStatus =
  (typeof ACTUATION_STATUS)[keyof typeof ACTUATION_STATUS]

export const LED_COLOR = {
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  AMBER_PULSE: "AMBER_PULSE",
} as const
export type LedColor = (typeof LED_COLOR)[keyof typeof LED_COLOR]

export const SENSOR_TYPE = {
  FLAME: "FLAME",
  GAS: "GAS",
  WATER: "WATER",
  OCCUPANCY: "OCCUPANCY",
} as const
export type SensorType = (typeof SENSOR_TYPE)[keyof typeof SENSOR_TYPE]
export const SENSOR_TYPES = Object.values(SENSOR_TYPE) as readonly SensorType[]

export const SENSOR_STATUS = {
  ONLINE: "ONLINE",
  WARMING_UP: "WARMING_UP",
  UNAVAILABLE: "UNAVAILABLE",
  MAINTENANCE: "MAINTENANCE",
  OFFLINE: "OFFLINE",
} as const
export type SensorStatus = (typeof SENSOR_STATUS)[keyof typeof SENSOR_STATUS]

export const VALIDATION_STATUS = {
  ACCEPTED: "ACCEPTED",
  ACCEPTED_OUT_OF_ORDER: "ACCEPTED_OUT_OF_ORDER",
  REJECTED: "REJECTED",
} as const
export type ValidationStatus =
  (typeof VALIDATION_STATUS)[keyof typeof VALIDATION_STATUS]

export const HAZARD_TYPE = {
  FIRE: "FIRE",
  GAS: "GAS",
  WATER: "WATER",
  OCCUPANCY: "OCCUPANCY",
} as const
export type HazardType = (typeof HAZARD_TYPE)[keyof typeof HAZARD_TYPE]
export const HAZARD_TYPES = Object.values(HAZARD_TYPE) as readonly HazardType[]

export const WATER_PHASE = {
  DRY: "DRY",
  RISING: "RISING",
  CRITICAL: "CRITICAL",
  RESET: "RESET",
} as const
export type WaterPhase = (typeof WATER_PHASE)[keyof typeof WATER_PHASE]

export const SYSTEM_EVENT_TYPE = {
  ZONE_OFFLINE: "ZONE_OFFLINE",
  ZONE_ONLINE: "ZONE_ONLINE",
  VALIDATION_FAILURE: "VALIDATION_FAILURE",
  DUPLICATE_READING: "DUPLICATE_READING",
  OUT_OF_ORDER_READING: "OUT_OF_ORDER_READING",
  SENSOR_UNAVAILABLE: "SENSOR_UNAVAILABLE",
  SENSOR_MAINTENANCE: "SENSOR_MAINTENANCE",
  ACTUATION_FAILED: "ACTUATION_FAILED",
  BACKEND_STARTED: "BACKEND_STARTED",
  STATE_RECONSTRUCTED: "STATE_RECONSTRUCTED",
  MAINTENANCE_MODE: "MAINTENANCE_MODE",
  AUTH_FAILURE: "AUTH_FAILURE",
} as const
export type SystemEventType =
  (typeof SYSTEM_EVENT_TYPE)[keyof typeof SYSTEM_EVENT_TYPE]

export const SYSTEM_EVENT_SEVERITY = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
} as const
export type SystemEventSeverity =
  (typeof SYSTEM_EVENT_SEVERITY)[keyof typeof SYSTEM_EVENT_SEVERITY]

export const INCIDENT_TIMELINE_EVENT_TYPE = {
  CREATED: "CREATED",
  RISK_UPDATED: "RISK_UPDATED",
  STATE_CHANGED: "STATE_CHANGED",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  ACTUATION_ISSUED: "ACTUATION_ISSUED",
  OVERRIDE_APPLIED: "OVERRIDE_APPLIED",
  ZONE_OFFLINE: "ZONE_OFFLINE",
  RESOLVED: "RESOLVED",
} as const
export type IncidentTimelineEventType =
  (typeof INCIDENT_TIMELINE_EVENT_TYPE)[keyof typeof INCIDENT_TIMELINE_EVENT_TYPE]

export const OVERRIDE_ACTION = {
  FORCE_MAINTENANCE_MODE: "FORCE_MAINTENANCE_MODE",
  CLEAR_MAINTENANCE_MODE: "CLEAR_MAINTENANCE_MODE",
  TEST_ACTUATION: "TEST_ACTUATION",
  SILENCE_BUZZER: "SILENCE_BUZZER",
  RESET_ACTUATION: "RESET_ACTUATION",
  MARK_SENSOR_MAINTENANCE: "MARK_SENSOR_MAINTENANCE",
  CLEAR_SENSOR_MAINTENANCE: "CLEAR_SENSOR_MAINTENANCE",
} as const
export type OverrideAction =
  (typeof OVERRIDE_ACTION)[keyof typeof OVERRIDE_ACTION]
export const OVERRIDE_ACTIONS = Object.values(
  OVERRIDE_ACTION
) as readonly OverrideAction[]

/** Bonus 1 — advisory only. Never influences state, incidents or actuation. */
export const RISK_TREND = {
  STABLE: "STABLE",
  RISING: "RISING",
  FALLING: "FALLING",
  TRENDING_CRITICAL: "TRENDING_CRITICAL",
} as const
export type RiskTrend = (typeof RISK_TREND)[keyof typeof RISK_TREND]

/** Bonus 3 — a report influences nothing until a human confirms it. */
export const REPORT_STATUS = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
} as const
export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS]
