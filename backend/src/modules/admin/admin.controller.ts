import type { Request, Response } from "express"
import {
  auditLogFilterSchema,
  createZoneSchema,
  overrideSchema,
  updateSensorSchema,
  updateUserRoleSchema,
  updateZoneSchema,
  USER_ROLE,
} from "@scsrg/shared"

import type { Prisma } from "@prisma/client"

import { prisma } from "../../database/prisma.js"
import { clientIp } from "../../middleware/request-context.middleware.js"
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "../../shared/errors.js"
import { created, ok, paginationMeta } from "../../shared/response.js"
import { newApiKey } from "../../shared/id.js"
import { hashApiKey } from "../auth/password.util.js"
import { searchAuditLogs, writeAuditLog } from "../audit/audit.service.js"
import { applyOverride } from "../overrides/overrides.service.js"
import {
  createCredential,
  revokeCredentials,
} from "../zones/zone-credential.repository.js"
import { findZoneByIdOrCode } from "../zones/zones.repository.js"
import { toZoneDetail } from "../zones/zone.mapper.js"
import { publishZoneUpdate } from "../../realtime/domain-events.js"
import { requiredPathParam } from "../../shared/params.js"
import { invalidateZoneKeyCache } from "../../middleware/zone-auth.middleware.js"

function requireUser(req: Request) {
  if (!req.user) throw new UnauthenticatedError()
  return req.user
}

/**
 * Creating a zone returns its plaintext API key **once**.
 *
 * A newly created zone can ingest immediately with no code change — the whole
 * pipeline is driven by zone and sensor configuration rows.
 */
export async function createZoneController(
  req: Request,
  res: Response
): Promise<void> {
  const user = requireUser(req)
  const input = createZoneSchema.parse(req.body)

  const existing = await prisma.zone.findUnique({ where: { code: input.code } })
  if (existing) {
    throw new ConflictError(`A zone with code "${input.code}" already exists.`)
  }

  const apiKey = newApiKey(input.code.replace(/-/g, ""))

  const zone = await prisma.zone.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      location: input.location ?? null,
      assetImportance: input.assetImportance,
      state: "OFFLINE",
      contributions: { fire: 0, gas: 0, water: 0, occupancy: 0 },
      reasons: ["No readings received yet"],
      sensors: {
        create: input.sensors.map((sensor) => ({
          type: sensor.type,
          name: sensor.name,
          isCritical: sensor.isCritical,
          configuration: (sensor.configuration ??
            {}) as unknown as Prisma.InputJsonObject,
          status: "OFFLINE",
        })),
      },
      credentials: {
        create: { apiKeyHash: await hashApiKey(apiKey), label: "created-by-admin" },
      },
    },
  })

  await writeAuditLog({
    userId: user.id,
    action: "ZONE_CREATED",
    entityType: "Zone",
    entityId: zone.id,
    metadata: { code: zone.code, name: zone.name },
    ipAddress: clientIp(req),
  })

  created(res, {
    zone: { id: zone.id, code: zone.code, name: zone.name },
    // Shown once, never retrievable again — only the hash is stored.
    apiKey,
    warning:
      "This API key is displayed once. Store it now; only its hash is persisted.",
  })
}

export async function updateZoneController(
  req: Request,
  res: Response
): Promise<void> {
  const user = requireUser(req)
  const zoneId = requiredPathParam(req, "zoneId", "No zone was specified.")

  const input = updateZoneSchema.parse(req.body)
  const zone = await findZoneByIdOrCode(zoneId)
  if (!zone) throw new NotFoundError("Zone not found.")

  await prisma.zone.update({ where: { id: zone.id }, data: input })

  await writeAuditLog({
    userId: user.id,
    action: "ZONE_UPDATED",
    entityType: "Zone",
    entityId: zone.id,
    metadata: { changes: input as Record<string, unknown> },
    ipAddress: clientIp(req),
  })

  await publishZoneUpdate(zone.id)

  const refreshed = await findZoneByIdOrCode(zone.id)
  ok(res, { zone: refreshed ? toZoneDetail(refreshed) : null })
}

export async function updateSensorController(
  req: Request,
  res: Response
): Promise<void> {
  const user = requireUser(req)
  const sensorId = requiredPathParam(req, "sensorId", "No sensor was specified.")

  const input = updateSensorSchema.parse(req.body)
  const sensor = await prisma.sensor.findUnique({ where: { id: sensorId } })
  if (!sensor) throw new NotFoundError("Sensor not found.")

  // `configuration` is free-form JSON, so it is applied separately from the
  // typed scalar fields rather than spread through Prisma's narrower input type.
  const { configuration, ...scalars } = input

  const updated = await prisma.sensor.update({
    where: { id: sensorId },
    data: {
      ...scalars,
      ...(configuration
        ? { configuration: configuration as unknown as Prisma.InputJsonObject }
        : {}),
    },
  })

  await writeAuditLog({
    userId: user.id,
    action: "SENSOR_UPDATED",
    entityType: "Sensor",
    entityId: sensorId,
    metadata: { changes: input as Record<string, unknown> },
    ipAddress: clientIp(req),
  })

  await publishZoneUpdate(sensor.zoneId)
  ok(res, { sensor: updated })
}

export async function overrideController(
  req: Request,
  res: Response
): Promise<void> {
  const user = requireUser(req)
  const zoneId = requiredPathParam(req, "zoneId", "No zone was specified.")

  const input = overrideSchema.parse(req.body)

  const override = await applyOverride({
    ...input,
    zoneIdentifier: zoneId,
    userId: user.id,
    userName: user.name,
    ipAddress: clientIp(req),
  })

  created(res, { override })
}

/**
 * Rotates a zone's API key.
 *
 * Real operational need — a key leaks, a node is replaced, a contractor leaves.
 * The previous credential is revoked in the same transaction as the new one is
 * issued, and the plaintext is returned exactly once.
 */
export async function rotateZoneKeyController(
  req: Request,
  res: Response
): Promise<void> {
  const user = requireUser(req)
  const zoneId = requiredPathParam(req, "zoneId", "No zone was specified.")

  const zone = await findZoneByIdOrCode(zoneId)
  if (!zone) throw new NotFoundError("Zone not found.")

  const apiKey = newApiKey(zone.code.replace(/-/g, ""))

  await prisma.$transaction(async (tx) => {
    await revokeCredentials(zone.id, tx)
    await createCredential(zone.id, await hashApiKey(apiKey), "rotated", tx)
  })

  // The old key must stop working immediately, not when its cache entry ages out.
  invalidateZoneKeyCache(zone.id)

  await writeAuditLog({
    userId: user.id,
    action: "ZONE_KEY_ROTATED",
    entityType: "Zone",
    entityId: zone.id,
    metadata: { zoneCode: zone.code },
    ipAddress: clientIp(req),
  })

  created(res, {
    zone: { id: zone.id, code: zone.code },
    apiKey,
    warning:
      "This API key is displayed once and the previous key is now revoked.",
  })
}

export async function listUsersController(
  _req: Request,
  res: Response
): Promise<void> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  })

  ok(res, {
    users: users.map((user) => ({
      ...user,
      createdAt: user.createdAt.toISOString(),
    })),
  })
}

export async function updateUserRoleController(
  req: Request,
  res: Response
): Promise<void> {
  const actor = requireUser(req)
  const userId = requiredPathParam(req, "userId", "No user was specified.")

  const { role } = updateUserRoleSchema.parse(req.body)
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) throw new NotFoundError("User not found.")

  // Guard against locking every admin out of the system.
  if (target.role === USER_ROLE.ADMIN && role !== USER_ROLE.ADMIN) {
    const adminCount = await prisma.user.count({
      where: { role: USER_ROLE.ADMIN, isActive: true },
    })
    if (adminCount <= 1) {
      throw new ValidationError(
        "This is the last administrator account; demoting it would lock everyone out."
      )
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  })

  await writeAuditLog({
    userId: actor.id,
    action: "USER_ROLE_CHANGED",
    entityType: "User",
    entityId: userId,
    metadata: { from: target.role, to: role },
    ipAddress: clientIp(req),
  })

  ok(res, { user: updated })
}

export async function listAuditLogsController(
  req: Request,
  res: Response
): Promise<void> {
  const filters = auditLogFilterSchema.parse(req.query)

  const [logs, total] = await searchAuditLogs({
    ...(filters.from ? { from: new Date(filters.from) } : {}),
    ...(filters.to ? { to: new Date(filters.to) } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    skip: (filters.page - 1) * filters.pageSize,
    take: filters.pageSize,
  })

  ok(res, { logs }, paginationMeta(filters.page, filters.pageSize, total))
}
