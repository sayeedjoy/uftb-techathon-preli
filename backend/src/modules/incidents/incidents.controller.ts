import type { Request, Response } from "express"
import {
  acknowledgeIncidentSchema,
  incidentFilterSchema,
  type IncidentDetailDto,
} from "@scsrg/shared"

import { NotFoundError, UnauthenticatedError } from "../../shared/errors.js"
import { ok, paginationMeta } from "../../shared/response.js"
import { clientIp } from "../../middleware/request-context.middleware.js"
import { acknowledgeIncident } from "../acknowledgments/acknowledgment.service.js"
import {
  listCommandsForIncident,
  toActuationCommandDto,
} from "../actuation/actuation.repository.js"
import { findReadingsAround } from "../ingestion/reading.repository.js"
import { toReadingDto } from "../zones/zones.service.js"
import { findIncidentById, searchIncidents } from "./incident.repository.js"
import { asPriorityExplanation, toIncidentSummary } from "./incident.mapper.js"
import { listTimeline, toTimelineEventDto } from "./timeline.repository.js"
import { requiredPathParam } from "../../shared/params.js"

function incidentIdParam(req: Request): string {
  return requiredPathParam(req, "incidentId", "No incident was specified.")
}

export async function listIncidentsController(
  req: Request,
  res: Response
): Promise<void> {
  const filters = incidentFilterSchema.parse(req.query)

  const [incidents, total] = await searchIncidents({
    ...(filters.from ? { from: new Date(filters.from) } : {}),
    ...(filters.to ? { to: new Date(filters.to) } : {}),
    ...(filters.zoneId ? { zoneId: filters.zoneId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.active ? { active: true } : {}),
    ...(filters.hazardType ? { hazardType: filters.hazardType } : {}),
    ...(filters.acknowledgedBy
      ? { acknowledgedBy: filters.acknowledgedBy }
      : {}),
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  })

  ok(
    res,
    { incidents: incidents.map(toIncidentSummary) },
    paginationMeta(filters.page, filters.pageSize, total)
  )
}

export async function getIncidentController(
  req: Request,
  res: Response
): Promise<void> {
  const incidentId = incidentIdParam(req)
  const incident = await findIncidentById(incidentId)
  if (!incident) throw new NotFoundError("Incident not found.")

  const windowStart = new Date(incident.startedAt.getTime() - 60_000)
  const windowEnd = incident.resolvedAt ?? new Date()

  const [timeline, commands, readings] = await Promise.all([
    listTimeline(incidentId),
    listCommandsForIncident(incidentId),
    findReadingsAround(incident.zoneId, windowStart, windowEnd, 300),
  ])

  const detail: IncidentDetailDto = {
    ...toIncidentSummary(incident),
    zoneState: incident.zone.state,
    priorityExplanation: asPriorityExplanation(incident.priorityExplanation),
    acknowledgment: incident.acknowledgment
      ? {
          id: incident.acknowledgment.id,
          incidentId: incident.id,
          userId: incident.acknowledgment.userId,
          userName: incident.acknowledgment.user.name,
          acknowledgedAt: incident.acknowledgment.acknowledgedAt.toISOString(),
          note: incident.acknowledgment.note,
        }
      : null,
    timeline: timeline.map(toTimelineEventDto),
    actuationCommands: commands.map(toActuationCommandDto),
    readings: readings.map(toReadingDto),
  }

  ok(res, { incident: detail })
}

export async function getIncidentTimelineController(
  req: Request,
  res: Response
): Promise<void> {
  const incidentId = incidentIdParam(req)
  const incident = await findIncidentById(incidentId)
  if (!incident) throw new NotFoundError("Incident not found.")

  const timeline = await listTimeline(incidentId)
  ok(res, { timeline: timeline.map(toTimelineEventDto) })
}

export async function acknowledgeIncidentController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) throw new UnauthenticatedError()

  const body = acknowledgeIncidentSchema.parse(req.body ?? {})
  const acknowledgment = await acknowledgeIncident({
    incidentId: incidentIdParam(req),
    userId: req.user.id,
    userName: req.user.name,
    ...(body.note ? { note: body.note } : {}),
    ipAddress: clientIp(req),
  })

  ok(res, { acknowledgment })
}
