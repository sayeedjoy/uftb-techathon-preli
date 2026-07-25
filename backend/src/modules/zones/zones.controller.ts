import type { Request, Response } from "express"
import { paginationSchema, USER_ROLE } from "@scsrg/shared"

import { ForbiddenError } from "../../shared/errors.js"
import { ok, paginationMeta } from "../../shared/response.js"
import {
  getAllZoneStatuses,
  getZoneDetail,
  getZoneReadings,
  getZoneTimeline,
  getZoneTransitions,
} from "./zones.service.js"
import { queryParam, requiredPathParam } from "../../shared/params.js"

function zoneIdParam(req: Request): string {
  return requiredPathParam(req, "zoneId", "No zone was specified.")
}

export async function listZonesController(
  req: Request,
  res: Response
): Promise<void> {
  // Only an admin may see deactivated zones.
  const includeInactive =
    req.query.includeInactive === "true" && req.user?.role === USER_ROLE.ADMIN

  ok(res, { zones: await getAllZoneStatuses(includeInactive) })
}

export async function getZoneController(
  req: Request,
  res: Response
): Promise<void> {
  ok(res, { zone: await getZoneDetail(zoneIdParam(req)) })
}

export async function getZoneReadingsController(
  req: Request,
  res: Response
): Promise<void> {
  // Raw historical readings are admin-only (spec §9.13).
  if (req.user?.role !== USER_ROLE.ADMIN) {
    throw new ForbiddenError("Raw sensor history is restricted to admins.")
  }

  const { page, pageSize } = paginationSchema.parse(req.query)
  const fromRaw = queryParam(req, "from")
  const toRaw = queryParam(req, "to")
  const from = fromRaw ? new Date(fromRaw) : undefined
  const to = toRaw ? new Date(toRaw) : undefined

  const { readings, total } = await getZoneReadings(zoneIdParam(req), {
    page,
    pageSize,
    ...(from && !Number.isNaN(from.getTime()) ? { from } : {}),
    ...(to && !Number.isNaN(to.getTime()) ? { to } : {}),
  })

  ok(res, { readings }, paginationMeta(page, pageSize, total))
}

export async function getZoneTimelineController(
  req: Request,
  res: Response
): Promise<void> {
  ok(res, { timeline: await getZoneTimeline(zoneIdParam(req)) })
}

export async function getZoneTransitionsController(
  req: Request,
  res: Response
): Promise<void> {
  ok(res, { transitions: await getZoneTransitions(zoneIdParam(req)) })
}
