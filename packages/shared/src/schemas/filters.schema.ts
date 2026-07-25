import { z } from "zod"

import {
  HAZARD_TYPES,
  INCIDENT_STATUSES,
  SYSTEM_EVENT_TYPE,
  ZONE_STATES,
} from "../domain/index.js"
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../api/envelope.js"

/** Query strings arrive as text; coerce once, here, for every list endpoint. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
})
export type PaginationInput = z.infer<typeof paginationSchema>

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be an ISO-8601 date-time",
  })

export const incidentFilterSchema = paginationSchema
  .extend({
    from: isoDate.optional(),
    to: isoDate.optional(),
    zoneId: z.string().trim().min(1).optional(),
    status: z.enum(INCIDENT_STATUSES).optional(),
    /** Convenience alias for `status in (OPEN, ACKNOWLEDGED)`. */
    active: z.coerce.boolean().optional(),
    hazardType: z.enum(HAZARD_TYPES).optional(),
    acknowledgedBy: z.string().trim().min(1).optional(),
    search: z.string().trim().max(120).optional(),
  })
  .refine(
    (value) =>
      !value.from ||
      !value.to ||
      Date.parse(value.from) <= Date.parse(value.to),
    { message: "`from` must not be after `to`", path: ["from"] }
  )
export type IncidentFilterInput = z.infer<typeof incidentFilterSchema>

export const readingFilterSchema = paginationSchema.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  validationStatus: z
    .enum(["ACCEPTED", "ACCEPTED_OUT_OF_ORDER", "REJECTED"])
    .optional(),
})
export type ReadingFilterInput = z.infer<typeof readingFilterSchema>

export const auditLogFilterSchema = paginationSchema.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  userId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
})
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>

export const systemEventFilterSchema = paginationSchema.extend({
  type: z.enum(Object.values(SYSTEM_EVENT_TYPE)).optional(),
  severity: z.enum(["INFO", "WARN", "ERROR"]).optional(),
  zoneId: z.string().trim().min(1).optional(),
})
export type SystemEventFilterInput = z.infer<typeof systemEventFilterSchema>

export const zoneStateFilterSchema = z.object({
  state: z.enum(ZONE_STATES).optional(),
  includeInactive: z.coerce.boolean().default(false),
})
export type ZoneStateFilterInput = z.infer<typeof zoneStateFilterSchema>

export const idParamsSchema = z.object({
  zoneId: z.string().trim().min(1).optional(),
  incidentId: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  commandId: z.string().trim().min(1).optional(),
  reportId: z.string().trim().min(1).optional(),
  scenarioId: z.string().trim().min(1).optional(),
})
