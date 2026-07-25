import type { Request, Response } from "express"
import {
  commandCompletionSchema,
  heartbeatSchema,
  sensorReadingSchema,
} from "@scsrg/shared"

import { NotFoundError, UnauthenticatedError } from "../../shared/errors.js"
import { created, ok } from "../../shared/response.js"
import {
  completeCommand,
  findPendingCommands,
  markDispatched,
  toActuationCommandDto,
} from "../actuation/actuation.repository.js"
import { ingestReading, recordHeartbeat } from "./ingestion.service.js"
import { requiredPathParam } from "../../shared/params.js"

function requireZone(req: Request) {
  if (!req.zone) throw new UnauthenticatedError("Zone authentication required.")
  return req.zone
}

export async function ingestReadingController(
  req: Request,
  res: Response
): Promise<void> {
  const zone = requireZone(req)
  // Step 2: shape validation. A client-supplied `riskScore` is rejected here.
  const payload = sensorReadingSchema.parse(req.body)

  const result = await ingestReading({ zoneId: zone.id, payload })
  created(res, result)
}

export async function heartbeatController(
  req: Request,
  res: Response
): Promise<void> {
  const zone = requireZone(req)
  heartbeatSchema.parse(req.body ?? {})

  const at = await recordHeartbeat(zone.id)
  ok(res, { zoneId: zone.id, lastSeenAt: at.toISOString() })
}

export async function pullCommandsController(
  req: Request,
  res: Response
): Promise<void> {
  const zone = requireZone(req)
  const commands = await findPendingCommands(zone.id)

  if (commands.length > 0) {
    await markDispatched(commands.map((command) => command.id))
  }

  ok(res, { commands: commands.map(toActuationCommandDto) })
}

export async function completeCommandController(
  req: Request,
  res: Response
): Promise<void> {
  const zone = requireZone(req)
  const commandId = requiredPathParam(
    req,
    "commandId",
    "No command was specified."
  )

  const body = commandCompletionSchema.parse(req.body ?? {})
  const result = await completeCommand(
    commandId,
    zone.id,
    body.status,
    body.message
  )

  if (result.count === 0) {
    throw new NotFoundError("No such command for this zone.")
  }

  ok(res, { commandId, status: body.status })
}
