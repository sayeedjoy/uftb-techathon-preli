import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { pushReading, pushReadings, resetSequence } from "../helpers/ingest.js"

/** Fire needs 5 consecutive positives before it contributes anything. */
const CONFIRM_FIRE = 5

async function driveToCritical(seeded: SeededZone) {
  return pushReadings(seeded, CONFIRM_FIRE, {
    fireDetected: true,
    gasLevel: 1,
    occupancyDetected: true,
  })
}

describe("incident lifecycle", () => {
  let seeded: SeededZone

  beforeEach(async () => {
    resetSequence()
    seeded = await createZoneFixture({ code: "incident-zone" })
  })

  it("opens exactly one incident when a zone enters CRITICAL", async () => {
    const result = await driveToCritical(seeded)

    expect(result?.computation.state).toBe("CRITICAL")
    expect(
      await prisma.incident.count({ where: { zoneId: seeded.zone.id } })
    ).toBe(1)

    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })
    expect(incident.status).toBe("OPEN")
    expect(incident.maximumRiskScore).toBeGreaterThanOrEqual(65)
  })

  it("does not create a second incident while the first is still open", async () => {
    await driveToCritical(seeded)
    await pushReadings(seeded, 10, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })

    expect(
      await prisma.incident.count({ where: { zoneId: seeded.zone.id } })
    ).toBe(1)
  })

  it("creates exactly one incident across a threshold oscillation", async () => {
    await driveToCritical(seeded)

    // Oscillate 63 ↔ 66 without ever meeting the recovery condition.
    for (let i = 0; i < 10; i += 1) {
      await pushReading(seeded, {
        fireDetected: true,
        gasLevel: 0.32,
        occupancyDetected: true,
      })
      await pushReading(seeded, {
        fireDetected: true,
        gasLevel: 0.45,
        occupancyDetected: true,
      })
    }

    expect(
      await prisma.incident.count({ where: { zoneId: seeded.zone.id } })
    ).toBe(1)
  })

  it("keeps the maximum risk score as a monotonic high-water mark", async () => {
    await driveToCritical(seeded)
    const peak = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })

    await pushReadings(seeded, 3, {
      fireDetected: true,
      gasLevel: 0.2,
      occupancyDetected: true,
    })

    const after = await prisma.incident.findUniqueOrThrow({
      where: { id: peak.id },
    })
    expect(after.maximumRiskScore).toBe(peak.maximumRiskScore)
    expect(after.currentRiskScore).toBeLessThan(after.maximumRiskScore)
  })

  it("requires consecutive calm readings before resolving", async () => {
    await driveToCritical(seeded)
    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })

    // Clear the flame: five negatives to drop the debounced signal.
    await pushReadings(seeded, 5, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })

    const resolved = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    })
    expect(resolved.status).toBe("RESOLVED")
    expect(resolved.resolvedAt).not.toBeNull()
  })

  it("does not resolve before the recovery count is met", async () => {
    await driveToCritical(seeded)
    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })

    // Two calm readings is one short of the configured three.
    await pushReading(seeded, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })
    await pushReading(seeded, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })

    const stillOpen = await prisma.incident.findUniqueOrThrow({
      where: { id: incident.id },
    })
    expect(stillOpen.status).toBe("OPEN")
  })

  it("creates a second, distinct incident after a resolved one re-triggers", async () => {
    await driveToCritical(seeded)
    await pushReadings(seeded, 6, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })

    const first = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })
    expect(first.status).toBe("RESOLVED")

    await driveToCritical(seeded)

    const incidents = await prisma.incident.findMany({
      where: { zoneId: seeded.zone.id },
      orderBy: { startedAt: "asc" },
    })
    expect(incidents).toHaveLength(2)
    expect(incidents[1]?.id).not.toBe(incidents[0]?.id)
    expect(incidents[1]?.status).toBe("OPEN")
  })

  it("records a complete, ordered timeline", async () => {
    await driveToCritical(seeded)
    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })

    await pushReadings(seeded, 6, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })

    const timeline = await prisma.incidentTimelineEvent.findMany({
      where: { incidentId: incident.id },
      orderBy: { createdAt: "asc" },
    })

    const types = timeline.map((event) => event.eventType)
    expect(types[0]).toBe("CREATED")
    expect(types).toContain("ACTUATION_ISSUED")
    expect(types.at(-1)).toBe("RESOLVED")

    // An incident can never exist without its CREATED event.
    expect(types.filter((type) => type === "CREATED")).toHaveLength(1)
    expect(types.filter((type) => type === "RESOLVED")).toHaveLength(1)
  })

  it("records the dominant hazards", async () => {
    await driveToCritical(seeded)

    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })
    expect(incident.dominantHazards).toContain("FIRE")
    expect(incident.dominantHazards).toContain("GAS")
  })

  it("suppresses incident creation for a zone in maintenance mode", async () => {
    await prisma.zone.update({
      where: { id: seeded.zone.id },
      data: { maintenanceMode: true },
    })
    const maintained = {
      ...seeded,
      zone: await prisma.zone.findUniqueOrThrow({
        where: { id: seeded.zone.id },
      }),
    }

    await driveToCritical(maintained)

    expect(
      await prisma.incident.count({ where: { zoneId: seeded.zone.id } })
    ).toBe(0)
    expect(await prisma.actuationCommand.count()).toBe(0)
  })

  it("a brief flicker never opens an incident", async () => {
    // Four positives is one short of the debounce threshold.
    await pushReadings(seeded, 4, {
      fireDetected: true,
      gasLevel: 0.5,
      occupancyDetected: true,
    })
    await pushReading(seeded, {
      fireDetected: false,
      gasLevel: 0.5,
      occupancyDetected: true,
    })

    expect(await prisma.incident.count()).toBe(0)
  })
})
