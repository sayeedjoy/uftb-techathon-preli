import type { IncidentTimelineEvent, Prisma } from "@prisma/client"
import type {
  IncidentTimelineEventDto,
  IncidentTimelineEventType,
} from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

export function appendTimelineEvent(
  data: {
    incidentId: string
    eventType: IncidentTimelineEventType
    message: string
    metadata?: Record<string, unknown>
    createdAt?: Date
  },
  db: DbHandle = prisma
): Promise<IncidentTimelineEvent> {
  return db.incidentTimelineEvent.create({
    data: {
      incidentId: data.incidentId,
      eventType: data.eventType,
      message: data.message,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    },
  })
}

export function listTimeline(
  incidentId: string,
  db: DbHandle = prisma
): Promise<IncidentTimelineEvent[]> {
  return db.incidentTimelineEvent.findMany({
    where: { incidentId },
    orderBy: { createdAt: "asc" },
  })
}

export function toTimelineEventDto(
  event: IncidentTimelineEvent
): IncidentTimelineEventDto {
  return {
    id: event.id,
    incidentId: event.incidentId,
    eventType: event.eventType,
    message: event.message,
    metadata:
      typeof event.metadata === "object" && event.metadata !== null
        ? (event.metadata as Record<string, unknown>)
        : {},
    createdAt: event.createdAt.toISOString(),
  }
}
