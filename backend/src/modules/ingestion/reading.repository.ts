import type { Prisma, SensorReading } from "@prisma/client"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

export function createReading(
  data: Prisma.SensorReadingUncheckedCreateInput,
  db: DbHandle = prisma
): Promise<SensorReading> {
  return db.sensorReading.create({ data })
}

/** The newest reading that was actually applied to live state. */
export function findLatestAccepted(
  zoneId: string,
  db: DbHandle = prisma
): Promise<SensorReading | null> {
  return db.sensorReading.findFirst({
    where: { zoneId, validationStatus: "ACCEPTED" },
    orderBy: [{ capturedAt: "desc" }, { sequenceNumber: "desc" }],
  })
}

/** Oldest → newest window used to rehydrate debounce counters at boot. */
export async function findRecentAccepted(
  zoneId: string,
  limit: number,
  db: DbHandle = prisma
): Promise<SensorReading[]> {
  const rows = await db.sensorReading.findMany({
    where: { zoneId, validationStatus: "ACCEPTED" },
    orderBy: { capturedAt: "desc" },
    take: limit,
  })
  return rows.reverse()
}

export function listReadings(
  zoneId: string,
  options: {
    skip?: number
    take?: number
    from?: Date
    to?: Date
    validationStatus?: SensorReading["validationStatus"]
  } = {},
  db: DbHandle = prisma
) {
  const where: Prisma.SensorReadingWhereInput = {
    zoneId,
    ...(options.validationStatus
      ? { validationStatus: options.validationStatus }
      : {}),
    ...(options.from || options.to
      ? {
          capturedAt: {
            ...(options.from ? { gte: options.from } : {}),
            ...(options.to ? { lte: options.to } : {}),
          },
        }
      : {}),
  }

  return Promise.all([
    db.sensorReading.findMany({
      where,
      orderBy: { capturedAt: "desc" },
      skip: options.skip ?? 0,
      take: options.take ?? 25,
    }),
    db.sensorReading.count({ where }),
  ])
}

/** Readings surrounding an incident, for the detail drawer's chart. */
export function findReadingsAround(
  zoneId: string,
  from: Date,
  to: Date,
  limit = 200,
  db: DbHandle = prisma
): Promise<SensorReading[]> {
  return db.sensorReading.findMany({
    where: { zoneId, capturedAt: { gte: from, lte: to } },
    orderBy: { capturedAt: "asc" },
    take: limit,
  })
}
