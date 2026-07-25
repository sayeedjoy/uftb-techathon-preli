import type { Prisma } from "@prisma/client"
import {
  SYSTEM_EVENT_SEVERITY,
  type SystemEventDto,
  type SystemEventSeverity,
  type SystemEventType,
} from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"
import { logger } from "../../config/logger.js"

export type SystemEventInput = {
  type: SystemEventType
  severity?: SystemEventSeverity
  message: string
  zoneId?: string | null
  sensorId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Writes a system event.
 *
 * Deliberately fire-and-forget-safe: a validation failure must still return its
 * 422 to the caller even if the observability write fails. The event is logged
 * either way, so nothing is lost silently.
 */
export async function recordSystemEvent(
  input: SystemEventInput,
  db: DbHandle = prisma
): Promise<void> {
  try {
    await db.systemEvent.create({
      data: {
        type: input.type,
        severity: input.severity ?? SYSTEM_EVENT_SEVERITY.INFO,
        message: input.message,
        zoneId: input.zoneId ?? null,
        sensorId: input.sensorId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    })
  } catch (error) {
    logger.warn(
      { err: error, event: input.type },
      "Could not persist system event"
    )
  }
}

export function listSystemEvents(
  options: {
    limit?: number
    type?: SystemEventType
    severity?: SystemEventSeverity
    zoneId?: string
  } = {},
  db: DbHandle = prisma
) {
  return db.systemEvent.findMany({
    where: {
      ...(options.type ? { type: options.type } : {}),
      ...(options.severity ? { severity: options.severity } : {}),
      ...(options.zoneId ? { zoneId: options.zoneId } : {}),
    },
    include: { zone: { select: { code: true } } },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 50,
  })
}

export function countRecentValidationFailures(
  since: Date,
  db: DbHandle = prisma
): Promise<number> {
  return db.systemEvent.count({
    where: { type: "VALIDATION_FAILURE", createdAt: { gte: since } },
  })
}

type SystemEventRow = Prisma.SystemEventGetPayload<{
  include: { zone: { select: { code: true } } }
}>

export function toSystemEventDto(event: SystemEventRow): SystemEventDto {
  return {
    id: event.id,
    zoneId: event.zoneId,
    zoneCode: event.zone?.code ?? null,
    sensorId: event.sensorId,
    type: event.type,
    severity: event.severity,
    message: event.message,
    metadata:
      typeof event.metadata === "object" && event.metadata !== null
        ? (event.metadata as Record<string, unknown>)
        : {},
    createdAt: event.createdAt.toISOString(),
  }
}
