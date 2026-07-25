import type { Request, Response } from "express"
import {
  scenarioRunSchema,
  simulatorFaultSchema,
  simulatorStartSchema,
  simulatorStatePatchSchema,
} from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import { UnauthenticatedError, ValidationError } from "../../shared/errors.js"
import { extractBearerToken } from "../auth/token.util.js"
import { ok } from "../../shared/response.js"
import { emitToAdmins } from "../../realtime/emitter.js"
import { simulator } from "./simulator.engine.js"
import { runScenario } from "./scenarios/scenario-runner.js"
import { requiredPathParam } from "../../shared/params.js"

/**
 * Registers every active zone with the engine.
 *
 * This is the one place the simulator needs to know which zones exist; the
 * lookup happens in the controller layer so the engine itself stays free of any
 * data-access import (see the architecture note on simulator.engine.ts).
 */
export async function syncSimulatorZones(): Promise<void> {
  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    include: { sensors: true },
    orderBy: { code: "asc" },
  })

  for (const zone of zones) {
    if (simulator.find(zone.id)) continue

    // Continue the sequence where the stored readings left off, so a restart
    // does not collide with already-persisted sequence numbers.
    const latest = await prisma.sensorReading.findFirst({
      where: { zoneId: zone.id },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    })

    simulator.register(
      { id: zone.id, code: zone.code, name: zone.name },
      zone.sensors.map((sensor) => sensor.type),
      latest?.sequenceNumber ?? 0
    )
  }
}

function zoneIdParam(req: Request): string {
  return requiredPathParam(req, "zoneId", "No zone was specified.")
}

export async function statusController(
  _req: Request,
  res: Response
): Promise<void> {
  await syncSimulatorZones()
  ok(res, simulator.status())
}

export async function startController(
  req: Request,
  res: Response
): Promise<void> {
  await syncSimulatorZones()
  const body = simulatorStartSchema.parse(req.body ?? {})

  simulator.start(zoneIdParam(req), body.intervalMs)
  emitToAdmins("simulator:status", simulator.status())

  ok(res, simulator.status())
}

export async function stopController(
  req: Request,
  res: Response
): Promise<void> {
  await syncSimulatorZones()
  simulator.stop(zoneIdParam(req))
  emitToAdmins("simulator:status", simulator.status())

  ok(res, simulator.status())
}

export async function patchStateController(
  req: Request,
  res: Response
): Promise<void> {
  await syncSimulatorZones()
  const patch = simulatorStatePatchSchema.parse(req.body ?? {})

  simulator.patch(zoneIdParam(req), patch)
  emitToAdmins("simulator:status", simulator.status())

  ok(res, simulator.status())
}

export async function injectFaultController(
  req: Request,
  res: Response
): Promise<void> {
  await syncSimulatorZones()
  const { fault } = simulatorFaultSchema.parse(req.body)

  const result = await simulator.injectFault(zoneIdParam(req), fault)
  // The backend's verbatim status code and body — never masked.
  ok(res, result)
}

export async function runScenarioController(
  req: Request,
  res: Response
): Promise<void> {
  const scenarioId = Number(requiredPathParam(req, "scenarioId"))
  if (!Number.isInteger(scenarioId)) {
    throw new ValidationError("Scenario id must be an integer.")
  }

  const token = extractBearerToken(req.headers.authorization)
  if (!token) throw new UnauthenticatedError()

  const options = scenarioRunSchema.parse(req.body ?? {})
  await syncSimulatorZones()

  const result = await runScenario(scenarioId, {
    authToken: token,
    ...(options.fast ? { fast: true } : {}),
  })

  ok(res, { result })
}

export async function stopAllController(
  _req: Request,
  res: Response
): Promise<void> {
  simulator.stopAll()
  emitToAdmins("simulator:status", simulator.status())
  ok(res, simulator.status())
}
