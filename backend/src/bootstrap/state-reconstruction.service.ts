import {
  SYSTEM_EVENT_SEVERITY,
  SYSTEM_EVENT_TYPE,
  ZONE_STATE,
} from "@scsrg/shared"

import { env } from "../config/env.js"
import { logger } from "../config/logger.js"
import { prisma } from "../database/prisma.js"
import { fireDebounce } from "../modules/ingestion/debounce.service.js"
import { occupancy } from "../modules/ingestion/occupancy.service.js"
import { gasWarmup } from "../modules/ingestion/warmup.service.js"
import { waterPhase } from "../modules/ingestion/water.service.js"
import { findRecentAccepted } from "../modules/ingestion/reading.repository.js"
import { recoveryTracker } from "../modules/zones/recovery.service.js"
import { recalculatePriorityQueue } from "../modules/priority-engine/priority-queue.service.js"
import { recordSystemEvent } from "../modules/system-health/system-event.repository.js"
import { startHeartbeatMonitor, sweepOfflineZones } from "../jobs/heartbeat-monitor.js"

/** How many stored readings are replayed to rebuild the debounce counters. */
const REHYDRATION_WINDOW = 40

export type ReconstructionSummary = {
  zones: number
  activeIncidents: number
  zonesMarkedOffline: number
  queueSize: number
}

/**
 * Steps 2–7 of the boot sequence (spec §9.11).
 *
 * The backend never assumes zones are SAFE after a restart. Every in-memory
 * cache — fire debounce, gas warm-up, occupancy debounce, water phase, recovery
 * counters — is rebuilt from Postgres, `OFFLINE` is re-derived from
 * `lastSeenAt` versus the wall clock, and the priority queue is recomputed
 * before anything is served.
 */
export async function reconstructState(
  now = new Date()
): Promise<ReconstructionSummary> {
  // 2. Load all active zones.
  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    include: { sensors: true },
  })

  // 3. Rehydrate per-zone caches from the last N accepted readings.
  for (const zone of zones) {
    const readings = await findRecentAccepted(zone.id, REHYDRATION_WINDOW)

    fireDebounce.rehydrate(zone.id, readings)
    occupancy.rehydrate(zone.id, readings)

    const lastWater = [...readings]
      .reverse()
      .find((reading) => reading.waterLevel !== null)
    waterPhase.rehydrate(zone.id, lastWater?.waterLevel ?? null)

    const gasSensor = zone.sensors.find((sensor) => sensor.type === "GAS")
    if (gasSensor) {
      gasWarmup.rehydrate(zone.id, gasSensor.warmupStartedAt, now.getTime())
    }

    recoveryTracker.rehydrate(
      zone.id,
      readings.map((reading) => reading.riskScore)
    )
  }

  // 4. Load active incidents (kept open across the restart by definition).
  const activeIncidents = await prisma.incident.count({
    where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
  })

  // 5. Re-derive OFFLINE from lastSeenAt versus the wall clock. A zone that
  //    went quiet while the backend was down comes back OFFLINE, not SAFE.
  const markedOffline = await sweepOfflineZones(now)

  // 6. Recalculate the priority queue.
  const queue = await recalculatePriorityQueue(now)

  // 7. Start heartbeat monitoring.
  startHeartbeatMonitor()

  const summary: ReconstructionSummary = {
    zones: zones.length,
    activeIncidents,
    zonesMarkedOffline: markedOffline.length,
    queueSize: queue.length,
  }

  await recordSystemEvent({
    type: SYSTEM_EVENT_TYPE.STATE_RECONSTRUCTED,
    severity: SYSTEM_EVENT_SEVERITY.INFO,
    message: `State reconstructed after start: ${summary.zones} zones, ${summary.activeIncidents} active incidents, ${summary.zonesMarkedOffline} marked offline`,
    metadata: { ...summary },
  })

  logger.info(
    { offlineTimeoutMs: env.ZONE_OFFLINE_TIMEOUT_MS, ...summary },
    "Zone states reconstructed from the database"
  )

  // Zones that have never reported stay OFFLINE — the initial schema default.
  const assumedSafe = zones.filter(
    (zone) => zone.state === ZONE_STATE.SAFE && zone.lastSeenAt === null
  )
  if (assumedSafe.length > 0) {
    logger.warn(
      { zones: assumedSafe.map((zone) => zone.code) },
      "Zones marked SAFE with no lastSeenAt were found; the offline sweep will correct them"
    )
  }

  return summary
}
