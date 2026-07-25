import type { Prisma } from "@prisma/client"
import type { AuditLogDto } from "@scsrg/shared"

import { logger } from "../../config/logger.js"
import { prisma } from "../../database/prisma.js"
import type { DbHandle } from "../../database/transaction.js"

export type AuditLogInput = {
  userId: string | null
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string | null
}

/**
 * Writes the audit trail. Every state-changing admin action and every
 * acknowledgment lands here with who, when, what and from where.
 */
export async function writeAuditLog(
  input: AuditLogInput,
  db: DbHandle = prisma
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
      },
    })
  } catch (error) {
    logger.error({ err: error, action: input.action }, "Audit log write failed")
    throw error
  }
}

export type AuditLogQuery = {
  from?: Date
  to?: Date
  userId?: string
  action?: string
  entityType?: string
  skip?: number
  take?: number
}

export async function searchAuditLogs(
  query: AuditLogQuery
): Promise<[AuditLogDto[], number]> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip ?? 0,
      take: query.take ?? 25,
    }),
    prisma.auditLog.count({ where }),
  ])

  return [
    rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userName: row.user?.name ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata:
        typeof row.metadata === "object" && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {},
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  ]
}
