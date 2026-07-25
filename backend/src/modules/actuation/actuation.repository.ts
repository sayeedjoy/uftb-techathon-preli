import type { ActuationCommand, Prisma } from "@prisma/client"
import type {
  ActuationCommandDto,
  ActuationSource,
  ActuationType,
} from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

export function createCommand(
  data: {
    zoneId: string
    incidentId?: string | null
    type: ActuationType
    payload: Record<string, unknown>
    source: ActuationSource
    requestedAt?: Date
  },
  db: DbHandle = prisma
): Promise<ActuationCommand> {
  return db.actuationCommand.create({
    data: {
      zoneId: data.zoneId,
      incidentId: data.incidentId ?? null,
      type: data.type,
      payload: data.payload as Prisma.InputJsonValue,
      source: data.source,
      status: "PENDING",
      ...(data.requestedAt ? { requestedAt: data.requestedAt } : {}),
    },
  })
}

/** Commands a node has not yet picked up. */
export function findPendingCommands(
  zoneId: string,
  db: DbHandle = prisma
): Promise<ActuationCommand[]> {
  return db.actuationCommand.findMany({
    where: { zoneId, status: { in: ["PENDING", "DISPATCHED"] } },
    orderBy: { requestedAt: "asc" },
  })
}

export function markDispatched(
  ids: string[],
  db: DbHandle = prisma
) {
  return db.actuationCommand.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "DISPATCHED" },
  })
}

export function completeCommand(
  commandId: string,
  zoneId: string,
  status: "COMPLETED" | "FAILED",
  message: string | undefined,
  db: DbHandle = prisma
) {
  return db.actuationCommand.updateMany({
    where: { id: commandId, zoneId },
    data: { status, executedAt: new Date(), message: message ?? null },
  })
}

export function listCommandsForZone(
  zoneId: string,
  limit = 50,
  db: DbHandle = prisma
): Promise<ActuationCommand[]> {
  return db.actuationCommand.findMany({
    where: { zoneId },
    orderBy: { requestedAt: "desc" },
    take: limit,
  })
}

export function listCommandsForIncident(
  incidentId: string,
  db: DbHandle = prisma
): Promise<ActuationCommand[]> {
  return db.actuationCommand.findMany({
    where: { incidentId },
    orderBy: { requestedAt: "asc" },
  })
}

export function findFailedCommands(limit = 25, db: DbHandle = prisma) {
  return db.actuationCommand.findMany({
    where: { status: { in: ["FAILED", "EXPIRED"] } },
    include: { zone: { select: { code: true } } },
    orderBy: { requestedAt: "desc" },
    take: limit,
  })
}

export function toActuationCommandDto(
  command: ActuationCommand
): ActuationCommandDto {
  return {
    id: command.id,
    zoneId: command.zoneId,
    incidentId: command.incidentId,
    type: command.type,
    payload:
      typeof command.payload === "object" && command.payload !== null
        ? (command.payload as Record<string, unknown>)
        : {},
    source: command.source,
    status: command.status,
    requestedAt: command.requestedAt.toISOString(),
    executedAt: command.executedAt?.toISOString() ?? null,
  }
}
