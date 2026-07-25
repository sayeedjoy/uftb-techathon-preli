import { beforeEach, describe, expect, it } from "vitest"

import { reconstructState } from "../../bootstrap/state-reconstruction.service.js"
import { prisma } from "../../database/prisma.js"
import { fireDebounce } from "../../modules/ingestion/debounce.service.js"
import { occupancy } from "../../modules/ingestion/occupancy.service.js"
import { getPriorityQueue } from "../../modules/priority-engine/priority-queue.service.js"
import { stopHeartbeatMonitor } from "../../jobs/heartbeat-monitor.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { pushReading, pushReadings, resetSequence } from "../helpers/ingest.js"
import { resetInMemoryState } from "../setup.js"

const CRITICAL = {
  fireDetected: true,
  gasLevel: 1,
  occupancyDetected: true,
} as const

/**
 * Simulates a process restart: every in-memory cache is dropped, exactly as it
 * would be by a `kill`, and only Postgres survives.
 */
async function restart() {
  resetInMemoryState()
  const summary = await reconstructState()
  stopHeartbeatMonitor()
  return summary
}

describe("backend restart recovery", () => {
  let zone: SeededZone
  let quiet: SeededZone

  beforeEach(async () => {
    resetSequence()
    zone = await createZoneFixture({ code: "restart-critical" })
    quiet = await createZoneFixture({ code: "restart-quiet" })
  })

  it("restores zone states, open incidents and the priority queue exactly", async () => {
    await pushReadings(zone, 5, CRITICAL)
    await pushReading(quiet, { gasLevel: 0.05, occupancyDetected: false })

    const before = {
      zones: await prisma.zone.findMany({
        orderBy: { code: "asc" },
        select: { code: true, state: true, currentRiskScore: true },
      }),
      incidents: await prisma.incident.findMany({
        where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          zoneId: true,
          status: true,
          maximumRiskScore: true,
        },
      }),
      queue: (await getPriorityQueue()).map((entry) => [
        entry.rank,
        entry.incidentId,
      ]),
    }

    expect(before.incidents).toHaveLength(1)

    await restart()

    const after = {
      zones: await prisma.zone.findMany({
        orderBy: { code: "asc" },
        select: { code: true, state: true, currentRiskScore: true },
      }),
      incidents: await prisma.incident.findMany({
        where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          zoneId: true,
          status: true,
          maximumRiskScore: true,
        },
      }),
      queue: (await getPriorityQueue()).map((entry) => [
        entry.rank,
        entry.incidentId,
      ]),
    }

    expect(after.incidents).toEqual(before.incidents)
    expect(after.queue).toEqual(before.queue)

    const criticalAfter = after.zones.find((z) => z.code === "restart-critical")
    expect(criticalAfter?.state).toBe("CRITICAL")
    expect(criticalAfter?.currentRiskScore).toBe(
      before.zones.find((z) => z.code === "restart-critical")?.currentRiskScore
    )
  })

  it("rehydrates the fire debounce so a restart cannot silence a confirmed fire", async () => {
    await pushReadings(zone, 5, CRITICAL)
    expect(fireDebounce.peek(zone.zone.id).signal).toBe(1)

    await restart()

    expect(fireDebounce.peek(zone.zone.id).signal).toBe(1)
  })

  it("rehydrates occupancy without inventing a false", async () => {
    await pushReadings(zone, 4, {
      fireDetected: false,
      gasLevel: 0.1,
      occupancyDetected: true,
    })

    await restart()

    expect(occupancy.peek(zone.zone.id)).toBe(true)
  })

  it("re-derives OFFLINE from lastSeenAt — a zone silent during downtime is not SAFE", async () => {
    await pushReading(zone, { gasLevel: 0.05, occupancyDetected: false })

    // Backdate lastSeenAt to simulate the backend having been down for a while.
    await prisma.zone.update({
      where: { id: zone.zone.id },
      data: { lastSeenAt: new Date(Date.now() - 60_000) },
    })

    await restart()

    const after = await prisma.zone.findUniqueOrThrow({
      where: { id: zone.zone.id },
    })
    expect(after.state).toBe("OFFLINE")
    expect(after.state).not.toBe("SAFE")
  })

  it("never assumes a never-reported zone is SAFE", async () => {
    await restart()

    const after = await prisma.zone.findUniqueOrThrow({
      where: { id: quiet.zone.id },
    })
    expect(after.state).toBe("OFFLINE")
  })

  it("continues the incident rather than opening a duplicate after restart", async () => {
    await pushReadings(zone, 5, CRITICAL)
    const before = await prisma.incident.findFirstOrThrow({
      where: { zoneId: zone.zone.id },
    })

    await restart()
    await pushReadings(zone, 5, CRITICAL)

    const incidents = await prisma.incident.findMany({
      where: { zoneId: zone.zone.id },
    })
    expect(incidents).toHaveLength(1)
    expect(incidents[0]?.id).toBe(before.id)
  })

  it("reports what it reconstructed", async () => {
    await pushReadings(zone, 5, CRITICAL)

    const summary = await restart()

    expect(summary.zones).toBe(2)
    expect(summary.activeIncidents).toBe(1)
    expect(summary.queueSize).toBe(1)
  })
})
