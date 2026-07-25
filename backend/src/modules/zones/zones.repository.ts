import type { Prisma, Sensor, Zone } from "@prisma/client"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

/** Zone plus everything the dashboard needs, fetched in one round trip. */
export const zoneWithRelations = {
  sensors: { orderBy: { type: "asc" } },
  incidents: {
    where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    include: { acknowledgment: { include: { user: true } } },
    take: 1,
  },
  readings: {
    orderBy: { capturedAt: "desc" },
    where: { validationStatus: "ACCEPTED" },
    take: 1,
  },
} satisfies Prisma.ZoneInclude

export type ZoneWithRelations = Prisma.ZoneGetPayload<{
  include: typeof zoneWithRelations
}>

/**
 * Every zone's current status in a single query set — the Command Center grid
 * is one request, never one request per card.
 */
export function listZones(
  options: { includeInactive?: boolean } = {},
  db: DbHandle = prisma
): Promise<ZoneWithRelations[]> {
  return db.zone.findMany({
    where: options.includeInactive ? {} : { isActive: true },
    include: zoneWithRelations,
    orderBy: { code: "asc" },
  })
}

export function findZoneById(
  zoneId: string,
  db: DbHandle = prisma
): Promise<ZoneWithRelations | null> {
  return db.zone.findUnique({
    where: { id: zoneId },
    include: zoneWithRelations,
  })
}

export function findZoneByCode(
  code: string,
  db: DbHandle = prisma
): Promise<ZoneWithRelations | null> {
  return db.zone.findUnique({
    where: { code },
    include: zoneWithRelations,
  })
}

/**
 * Resolves a zone by its id *or* its code, so `/zones/iot-lab` and
 * `/zones/<uuid>` both work — sensor nodes are configured with the readable
 * code, dashboards link by id.
 */
export function findZoneByIdOrCode(
  identifier: string,
  db: DbHandle = prisma
): Promise<ZoneWithRelations | null> {
  return db.zone.findFirst({
    where: { OR: [{ id: identifier }, { code: identifier }] },
    include: zoneWithRelations,
  })
}

export function findSensors(
  zoneId: string,
  db: DbHandle = prisma
): Promise<Sensor[]> {
  return db.sensor.findMany({ where: { zoneId }, orderBy: { type: "asc" } })
}

export function updateZone(
  zoneId: string,
  data: Prisma.ZoneUpdateInput,
  db: DbHandle = prisma
): Promise<Zone> {
  return db.zone.update({ where: { id: zoneId }, data })
}

export function touchLastSeen(
  zoneId: string,
  at: Date,
  db: DbHandle = prisma
): Promise<Zone> {
  return db.zone.update({
    where: { id: zoneId },
    data: { lastSeenAt: at },
  })
}

export function updateSensorStatus(
  sensorId: string,
  data: Prisma.SensorUpdateInput,
  db: DbHandle = prisma
): Promise<Sensor> {
  return db.sensor.update({ where: { id: sensorId }, data })
}

export function createTransition(
  data: Prisma.ZoneStateTransitionUncheckedCreateInput,
  db: DbHandle = prisma
) {
  return db.zoneStateTransition.create({ data })
}

export function listTransitions(
  zoneId: string,
  limit = 100,
  db: DbHandle = prisma
) {
  return db.zoneStateTransition.findMany({
    where: { zoneId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

/** Zones that have gone quiet past the timeout — the offline sweep's input. */
export function findStaleZones(
  threshold: Date,
  db: DbHandle = prisma
): Promise<Zone[]> {
  return db.zone.findMany({
    where: {
      isActive: true,
      state: { not: "OFFLINE" },
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: threshold } }],
    },
  })
}
