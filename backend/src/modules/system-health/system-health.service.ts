import type {
  SystemHealthDto,
  SystemHealthRollupDto,
  ZoneConnectivityDto,
} from "@scsrg/shared"

import { env } from "../../config/env.js"
import { checkDatabase, prisma } from "../../database/prisma.js"
import { socketConnectionCount } from "../../realtime/socket-server.js"
import { findFailedCommands } from "../actuation/actuation.repository.js"
import {
  countRecentValidationFailures,
  listSystemEvents,
  toSystemEventDto,
} from "./system-event.repository.js"

const startedAt = Date.now()

function toConnectivity(
  zone: {
    id: string
    code: string
    name: string
    state: ZoneConnectivityDto["state"]
    lastSeenAt: Date | null
    lastReadingAt: Date | null
    sensors: Array<{
      id: string
      type: string
      status: string
      lastSeenAt: Date | null
    }>
  },
  now: number
): ZoneConnectivityDto {
  const secondsSinceLastSeen = zone.lastSeenAt
    ? Math.floor((now - zone.lastSeenAt.getTime()) / 1000)
    : null

  return {
    zoneId: zone.id,
    zoneCode: zone.code,
    zoneName: zone.name,
    state: zone.state,
    lastSeenAt: zone.lastSeenAt?.toISOString() ?? null,
    lastReadingAt: zone.lastReadingAt?.toISOString() ?? null,
    secondsSinceLastSeen,
    isOffline: zone.state === "OFFLINE",
    sensors: zone.sensors.map((sensor) => ({
      id: sensor.id,
      type: sensor.type,
      status: sensor.status,
      lastSeenAt: sensor.lastSeenAt?.toISOString() ?? null,
    })),
  }
}

/** Compact rollup for the dashboard summary — safe for both roles. */
export async function getHealthRollup(): Promise<SystemHealthRollupDto> {
  const since = new Date(Date.now() - 15 * 60_000)
  const [database, offlineZoneCount, failedActuationCount, validationFailures] =
    await Promise.all([
      checkDatabase(),
      prisma.zone.count({ where: { isActive: true, state: "OFFLINE" } }),
      prisma.actuationCommand.count({
        where: { status: { in: ["FAILED", "EXPIRED"] } },
      }),
      countRecentValidationFailures(since),
    ])

  return {
    backendStatus: database.connected ? "OK" : "DEGRADED",
    databaseConnected: database.connected,
    socketConnections: socketConnectionCount(),
    offlineZoneCount,
    failedActuationCount,
    recentValidationFailureCount: validationFailures,
  }
}

/** Full admin-only picture backing the System Health page. */
export async function getSystemHealth(): Promise<SystemHealthDto> {
  const now = Date.now()

  const [database, zones, failedCommands, validationFailures, recentEvents] =
    await Promise.all([
      checkDatabase(),
      prisma.zone.findMany({
        where: { isActive: true },
        include: { sensors: true },
        orderBy: { code: "asc" },
      }),
      findFailedCommands(25),
      listSystemEvents({ type: "VALIDATION_FAILURE", limit: 25 }),
      listSystemEvents({ limit: 50 }),
    ])

  const connectivity = zones.map((zone) => toConnectivity(zone, now))

  return {
    backendStatus: database.connected ? "OK" : "DEGRADED",
    uptimeSeconds: Math.floor((now - startedAt) / 1000),
    databaseConnected: database.connected,
    databaseLatencyMs: database.latencyMs,
    socketConnections: socketConnectionCount(),
    zones: connectivity,
    offlineZones: connectivity.filter((zone) => zone.isOffline),
    failedActuationCommands: failedCommands.map((command) => ({
      id: command.id,
      zoneId: command.zoneId,
      zoneCode: command.zone.code,
      type: command.type,
      status: command.status,
      requestedAt: command.requestedAt.toISOString(),
    })),
    recentValidationFailures: validationFailures.map(toSystemEventDto),
    recentSystemEvents: recentEvents.map(toSystemEventDto),
  }
}

export async function getZoneSystemHealth(zoneId: string) {
  const zone = await prisma.zone.findFirst({
    where: { OR: [{ id: zoneId }, { code: zoneId }] },
    include: { sensors: true },
  })
  if (!zone) return null

  const [events, commands] = await Promise.all([
    listSystemEvents({ zoneId: zone.id, limit: 25 }),
    findFailedCommands(10),
  ])

  return {
    zone: toConnectivity(zone, Date.now()),
    offlineTimeoutMs: env.ZONE_OFFLINE_TIMEOUT_MS,
    recentEvents: events.map(toSystemEventDto),
    failedCommands: commands
      .filter((command) => command.zoneId === zone.id)
      .map((command) => ({
        id: command.id,
        type: command.type,
        status: command.status,
        requestedAt: command.requestedAt.toISOString(),
      })),
  }
}
