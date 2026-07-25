import type { Request, Response } from "express"

import { NotFoundError } from "../../shared/errors.js"
import { ok } from "../../shared/response.js"
import {
  getSystemHealth,
  getZoneSystemHealth,
} from "./system-health.service.js"
import { requiredPathParam } from "../../shared/params.js"

export async function systemHealthController(
  _req: Request,
  res: Response
): Promise<void> {
  ok(res, await getSystemHealth())
}

export async function zoneSystemHealthController(
  req: Request,
  res: Response
): Promise<void> {
  const zoneId = requiredPathParam(req, "zoneId", "No zone was specified.")

  const health = await getZoneSystemHealth(zoneId)
  if (!health) throw new NotFoundError("Zone not found.")

  ok(res, health)
}
