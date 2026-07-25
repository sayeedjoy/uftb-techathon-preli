import {
  SENSOR_STATUS,
  SYSTEM_EVENT_SEVERITY,
  SYSTEM_EVENT_TYPE,
  ZONE_STATE,
} from "@scsrg/shared"

import { env } from "../config/env.js"
import { logger } from "../config/logger.js"
import { prisma } from "../database/prisma.js"
import { withTransaction } from "../database/transaction.js"
import { applyZoneState } from "../modules/zones/zone-state.service.js"
import { findStaleZones } from "../modules/zones/zones.repository.js"
import { recordSystemEvent } from "../modules/system-health/system-event.repository.js"
import { publishZoneOffline } from "../realtime/domain-events.js"
import { recalculatePriorityQueue } from "../modules/priority-engine/priority-queue.service.js"

let timer: NodeJS.Timeout | null = null
let running = false

/**
 * Marks zones OFFLINE when they stop reporting.
 *
 * OFFLINE is never SAFE and never silently closes an incident: the transition
 * is recorded, a system event is written, `lastSeenAt` stays visible, and any
 * active incident is left open. A zone that goes quiet mid-fire is still on
 * fire as far as this system is concerned.
 */
export async function sweepOfflineZones(now = new Date()): Promise<string[]> {
  const threshold = new Date(now.getTime() - env.ZONE_OFFLINE_TIMEOUT_MS)
  const stale = await findStaleZones(threshold)
  const markedOffline: string[] = []

  for (const zone of stale) {
    await withTransaction(async (tx) => {
      // Re-read inside the transaction: a reading may have landed since.
      const fresh = await tx.zone.findUnique({ where: { id: zone.id } })
      if (!fresh || fresh.state === ZONE_STATE.OFFLINE) return
      if (fresh.lastSeenAt && fresh.lastSeenAt >= threshold) return

      await applyZoneState(tx, {
        zone: fresh,
        newState: ZONE_STATE.OFFLINE,
        riskScore: fresh.currentRiskScore,
        contributions:
          typeof fresh.contributions === "object" && fresh.contributions !== null
            ? (fresh.contributions as {
                fire: number
                gas: number
                water: number
                occupancy: number
              })
            : { fire: 0, gas: 0, water: 0, occupancy: 0 },
        reasons: [
          fresh.lastSeenAt
            ? `No reading or heartbeat since ${fresh.lastSeenAt.toISOString()} — zone is offline, not safe`
            : "This zone has never reported — offline, not safe",
        ],
        dominantHazards: [],
        activeHazardCount: 0,
        at: now,
        reason: "Heartbeat timeout",
        // Do not stamp lastSeenAt: the whole point is that we have not seen it.
        touchLastSeen: false,
      })

      await tx.sensor.updateMany({
        where: { zoneId: fresh.id, status: { not: SENSOR_STATUS.MAINTENANCE } },
        data: { status: SENSOR_STATUS.OFFLINE },
      })
    })

    markedOffline.push(zone.id)

    await recordSystemEvent({
      type: SYSTEM_EVENT_TYPE.ZONE_OFFLINE,
      severity: SYSTEM_EVENT_SEVERITY.WARN,
      message: `Zone ${zone.code} went offline (no data for ${Math.round(env.ZONE_OFFLINE_TIMEOUT_MS / 1000)}s)`,
      zoneId: zone.id,
      metadata: { lastSeenAt: zone.lastSeenAt?.toISOString() ?? null },
    })

    await publishZoneOffline(zone.id)
  }

  if (markedOffline.length > 0) {
    await recalculatePriorityQueue(now)
  }

  return markedOffline
}

/**
 * A zone whose *critical* sensor (flame) is unavailable is treated as OFFLINE
 * even while its other sensors keep reporting — a blind fire detector is not a
 * safe zone.
 */
export async function sweepCriticalSensorFailures(
  now = new Date()
): Promise<string[]> {
  const zones = await prisma.zone.findMany({
    where: {
      isActive: true,
      state: { not: ZONE_STATE.OFFLINE },
      sensors: {
        some: {
          isCritical: true,
          status: { in: [SENSOR_STATUS.UNAVAILABLE, SENSOR_STATUS.OFFLINE] },
        },
      },
    },
    include: { sensors: true },
  })

  const affected: string[] = []

  for (const zone of zones) {
    const blindSensor = zone.sensors.find(
      (sensor) =>
        sensor.isCritical &&
        (sensor.status === SENSOR_STATUS.UNAVAILABLE ||
          sensor.status === SENSOR_STATUS.OFFLINE)
    )
    if (!blindSensor) continue

    await withTransaction(async (tx) => {
      const fresh = await tx.zone.findUnique({ where: { id: zone.id } })
      if (!fresh || fresh.state === ZONE_STATE.OFFLINE) return

      await applyZoneState(tx, {
        zone: fresh,
        newState: ZONE_STATE.OFFLINE,
        riskScore: fresh.currentRiskScore,
        contributions: { fire: 0, gas: 0, water: 0, occupancy: 0 },
        reasons: [
          `Critical sensor "${blindSensor.name}" is unavailable — the zone cannot be considered safe`,
        ],
        dominantHazards: [],
        activeHazardCount: 0,
        at: now,
        reason: `Critical sensor ${blindSensor.type} unavailable`,
        touchLastSeen: false,
      })
    })

    affected.push(zone.id)

    await recordSystemEvent({
      type: SYSTEM_EVENT_TYPE.SENSOR_UNAVAILABLE,
      severity: SYSTEM_EVENT_SEVERITY.WARN,
      message: `Zone ${zone.code} marked OFFLINE: critical sensor ${blindSensor.type} is unavailable`,
      zoneId: zone.id,
      sensorId: blindSensor.id,
    })

    await publishZoneOffline(zone.id)
  }

  return affected
}

export function startHeartbeatMonitor(): void {
  if (timer) return

  timer = setInterval(() => {
    if (running) return
    running = true
    void (async () => {
      try {
        await sweepOfflineZones()
        await sweepCriticalSensorFailures()
      } catch (error) {
        logger.error({ err: error }, "Offline sweep failed")
      } finally {
        running = false
      }
    })()
  }, env.ZONE_OFFLINE_SWEEP_MS)

  timer.unref()
  logger.info(
    { sweepMs: env.ZONE_OFFLINE_SWEEP_MS, timeoutMs: env.ZONE_OFFLINE_TIMEOUT_MS },
    "Heartbeat monitor started"
  )
}

export function stopHeartbeatMonitor(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
