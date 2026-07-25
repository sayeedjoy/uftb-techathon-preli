import type { Incident, Prisma } from "@prisma/client"
import { ACTIVE_INCIDENT_STATUSES, type HazardType } from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

export const incidentWithRelations = {
  zone: true,
  acknowledgment: { include: { user: true } },
} satisfies Prisma.IncidentInclude

export type IncidentWithRelations = Prisma.IncidentGetPayload<{
  include: typeof incidentWithRelations
}>

export function findActiveIncident(
  zoneId: string,
  db: DbHandle = prisma
): Promise<IncidentWithRelations | null> {
  return db.incident.findFirst({
    where: { zoneId, status: { in: [...ACTIVE_INCIDENT_STATUSES] } },
    include: incidentWithRelations,
  })
}

export function listActiveIncidents(
  db: DbHandle = prisma
): Promise<IncidentWithRelations[]> {
  return db.incident.findMany({
    where: { status: { in: [...ACTIVE_INCIDENT_STATUSES] } },
    include: incidentWithRelations,
    orderBy: { startedAt: "asc" },
  })
}

export function findIncidentById(
  incidentId: string,
  db: DbHandle = prisma
): Promise<IncidentWithRelations | null> {
  return db.incident.findUnique({
    where: { id: incidentId },
    include: incidentWithRelations,
  })
}

export function createIncident(
  data: {
    zoneId: string
    riskScore: number
    dominantHazards: HazardType[]
    startedAt?: Date
  },
  db: DbHandle = prisma
): Promise<Incident> {
  return db.incident.create({
    data: {
      zoneId: data.zoneId,
      status: "OPEN",
      maximumRiskScore: data.riskScore,
      currentRiskScore: data.riskScore,
      dominantHazards: data.dominantHazards,
      ...(data.startedAt ? { startedAt: data.startedAt } : {}),
    },
  })
}

export function updateIncident(
  incidentId: string,
  data: Prisma.IncidentUpdateInput,
  db: DbHandle = prisma
): Promise<Incident> {
  return db.incident.update({ where: { id: incidentId }, data })
}

export function resolveIncident(
  incidentId: string,
  resolvedAt: Date,
  db: DbHandle = prisma
): Promise<Incident> {
  return db.incident.update({
    where: { id: incidentId },
    data: { status: "RESOLVED", resolvedAt },
  })
}

/**
 * Conditional acknowledgment update — the primary race guard.
 *
 * Returns the number of rows affected. Zero means someone else won, and the
 * caller must surface `409 ALREADY_ACKNOWLEDGED`. This is deliberately a
 * `updateMany` with a status predicate rather than a read-then-write: the
 * predicate and the write are one statement, so two concurrent requests cannot
 * both observe `OPEN`.
 */
export async function acknowledgeIfOpen(
  incidentId: string,
  acknowledgedAt: Date,
  db: DbHandle
): Promise<number> {
  const result = await db.incident.updateMany({
    where: { id: incidentId, status: "OPEN" },
    data: { status: "ACKNOWLEDGED", acknowledgedAt },
  })
  return result.count
}

export type IncidentQuery = {
  from?: Date
  to?: Date
  zoneId?: string
  status?: Incident["status"]
  active?: boolean
  hazardType?: HazardType
  acknowledgedBy?: string
  skip?: number
  take?: number
}

export function buildIncidentWhere(
  query: IncidentQuery
): Prisma.IncidentWhereInput {
  return {
    ...(query.zoneId ? { zoneId: query.zoneId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.active ? { status: { in: [...ACTIVE_INCIDENT_STATUSES] } } : {}),
    ...(query.hazardType ? { dominantHazards: { has: query.hazardType } } : {}),
    ...(query.acknowledgedBy
      ? { acknowledgment: { userId: query.acknowledgedBy } }
      : {}),
    ...(query.from || query.to
      ? {
          startedAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  }
}

export async function searchIncidents(
  query: IncidentQuery,
  db: DbHandle = prisma
): Promise<[IncidentWithRelations[], number]> {
  const where = buildIncidentWhere(query)
  return Promise.all([
    db.incident.findMany({
      where,
      include: incidentWithRelations,
      orderBy: [{ startedAt: "desc" }],
      skip: query.skip ?? 0,
      take: query.take ?? 25,
    }),
    db.incident.count({ where }),
  ])
}

export function countActiveIncidents(db: DbHandle = prisma): Promise<number> {
  return db.incident.count({
    where: { status: { in: [...ACTIVE_INCIDENT_STATUSES] } },
  })
}

export function countUnacknowledgedIncidents(
  db: DbHandle = prisma
): Promise<number> {
  return db.incident.count({ where: { status: "OPEN" } })
}
