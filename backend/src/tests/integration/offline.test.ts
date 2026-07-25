import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import {
  sweepCriticalSensorFailures,
  sweepOfflineZones,
} from "../../jobs/heartbeat-monitor.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { api } from "../helpers/request.js"
import { pushReading, pushReadings, resetSequence } from "../helpers/ingest.js"

/** Configured down to 300 ms in the test environment (see global-setup). */
const OFFLINE_TIMEOUT_MS = 300

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("offline detection", () => {
  let seeded: SeededZone

  beforeEach(async () => {
    resetSequence()
    seeded = await createZoneFixture({ code: "offline-zone" })
  })

  it("marks a silent zone OFFLINE — never SAFE", async () => {
    await pushReading(seeded, { gasLevel: 0.1, occupancyDetected: false })

    const before = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(before.state).toBe("SAFE")

    await sleep(OFFLINE_TIMEOUT_MS + 100)
    await sweepOfflineZones()

    const after = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(after.state).toBe("OFFLINE")
    expect(after.state).not.toBe("SAFE")
  })

  it("records the transition and a system event", async () => {
    await pushReading(seeded, { gasLevel: 0.1 })
    await sleep(OFFLINE_TIMEOUT_MS + 100)
    await sweepOfflineZones()

    const transition = await prisma.zoneStateTransition.findFirstOrThrow({
      where: { zoneId: seeded.zone.id, newState: "OFFLINE" },
    })
    expect(transition.previousState).toBe("SAFE")

    const event = await prisma.systemEvent.findFirstOrThrow({
      where: { zoneId: seeded.zone.id, type: "ZONE_OFFLINE" },
    })
    expect(event.severity).toBe("WARN")
  })

  it("preserves lastSeenAt so the UI can show how long it has been quiet", async () => {
    await pushReading(seeded, { gasLevel: 0.1 })
    const seenAt = (
      await prisma.zone.findUniqueOrThrow({ where: { id: seeded.zone.id } })
    ).lastSeenAt

    await sleep(OFFLINE_TIMEOUT_MS + 100)
    await sweepOfflineZones()

    const after = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(after.lastSeenAt?.getTime()).toBe(seenAt?.getTime())
  })

  it("leaves an active incident open when the zone goes offline", async () => {
    await pushReadings(seeded, 5, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })
    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })
    expect(incident.status).toBe("OPEN")

    await sleep(OFFLINE_TIMEOUT_MS + 100)
    await sweepOfflineZones()

    const after = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    })
    expect(after.status).toBe("OPEN")
    expect(after.resolvedAt).toBeNull()

    // …and the incident timeline says why it went quiet.
    const offlineEvent = await prisma.incidentTimelineEvent.findFirst({
      where: { incidentId: incident.id, eventType: "ZONE_OFFLINE" },
    })
    expect(offlineEvent).not.toBeNull()
  })

  it("does not silence the buzzer or relay when a zone drops mid-alarm", async () => {
    await pushReadings(seeded, 5, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })

    await sleep(OFFLINE_TIMEOUT_MS + 100)
    await sweepOfflineZones()

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.buzzerActive).toBe(true)
    expect(zone.relayCutoffActive).toBe(true)
    expect(zone.ledColor).toBe("AMBER_PULSE")
  })

  it("recomputes state from the first reading after reconnection — never assumes SAFE", async () => {
    await pushReading(seeded, { gasLevel: 0.1 })
    await sleep(OFFLINE_TIMEOUT_MS + 100)
    await sweepOfflineZones()

    await pushReading(seeded, { gasLevel: 0.9, occupancyDetected: true })

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.state).toBe("WARNING")
    expect(zone.currentRiskScore).toBe(37.5)
  })

  it("does not mark a zone offline while it is still reporting", async () => {
    await pushReading(seeded, { gasLevel: 0.1 })
    await sweepOfflineZones()

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.state).toBe("SAFE")
  })

  it("keeps a zone alive on a heartbeat alone", async () => {
    await pushReading(seeded, { gasLevel: 0.1 })
    await sleep(OFFLINE_TIMEOUT_MS - 150)

    const heartbeat = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/heartbeat`)
      .set("x-zone-api-key", seeded.apiKey)
      .send({})
    expect(heartbeat.status).toBe(200)

    await sweepOfflineZones()

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.state).toBe("SAFE")
    // A heartbeat updates liveness without inventing a reading.
    expect(await prisma.sensorReading.count({ where: { zoneId: zone.id } })).toBe(1)
  })

  it("marks a zone OFFLINE when its critical sensor goes blind", async () => {
    await pushReading(seeded, { gasLevel: 0.1, occupancyDetected: false })

    await prisma.sensor.updateMany({
      where: { zoneId: seeded.zone.id, isCritical: true },
      data: { status: "UNAVAILABLE" },
    })

    await sweepCriticalSensorFailures()

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.state).toBe("OFFLINE")
  })
})
