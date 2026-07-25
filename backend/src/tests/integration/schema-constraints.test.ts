import { describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createIncidentFixture, createZoneFixture } from "../fixtures/zone.fixture.js"

describe("database-enforced invariants", () => {
  it("rejects a second active incident for the same zone", async () => {
    const { zone } = await createZoneFixture()
    await createIncidentFixture(zone.id, { status: "OPEN" })

    await expect(
      createIncidentFixture(zone.id, { status: "ACKNOWLEDGED" })
    ).rejects.toThrow()

    const count = await prisma.incident.count({ where: { zoneId: zone.id } })
    expect(count).toBe(1)
  })

  it("allows a new incident once the previous one is resolved", async () => {
    const { zone } = await createZoneFixture()
    const first = await createIncidentFixture(zone.id, { status: "OPEN" })

    await prisma.incident.update({
      where: { id: first.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    })

    const second = await createIncidentFixture(zone.id, { status: "OPEN" })

    expect(second.id).not.toBe(first.id)
    expect(await prisma.incident.count({ where: { zoneId: zone.id } })).toBe(2)
  })

  it("allows active incidents in different zones simultaneously", async () => {
    const a = await createZoneFixture()
    const b = await createZoneFixture()

    await createIncidentFixture(a.zone.id)
    await createIncidentFixture(b.zone.id)

    expect(await prisma.incident.count({ where: { status: "OPEN" } })).toBe(2)
  })

  it("refuses to delete a zone that has incidents", async () => {
    const { zone } = await createZoneFixture()
    await createIncidentFixture(zone.id)

    await expect(
      prisma.zone.delete({ where: { id: zone.id } })
    ).rejects.toThrow()

    expect(await prisma.zone.findUnique({ where: { id: zone.id } })).not.toBeNull()
  })

  it("refuses to delete a zone that has readings", async () => {
    const { zone } = await createZoneFixture()
    await prisma.sensorReading.create({
      data: {
        readingId: "reading-restrict-1",
        zoneId: zone.id,
        sequenceNumber: 1,
        capturedAt: new Date(),
        riskScore: 0,
        calculatedState: "SAFE",
        contributions: { fire: 0, gas: 0, water: 0, occupancy: 0 },
      },
    })

    await expect(
      prisma.zone.delete({ where: { id: zone.id } })
    ).rejects.toThrow()
  })

  it("rejects a duplicate readingId", async () => {
    const { zone } = await createZoneFixture()
    const base = {
      zoneId: zone.id,
      capturedAt: new Date(),
      riskScore: 10,
      calculatedState: "SAFE" as const,
      contributions: { fire: 0, gas: 10, water: 0, occupancy: 0 },
    }

    await prisma.sensorReading.create({
      data: { ...base, readingId: "dup-1", sequenceNumber: 1 },
    })

    await expect(
      prisma.sensorReading.create({
        data: { ...base, readingId: "dup-1", sequenceNumber: 2 },
      })
    ).rejects.toThrow()

    expect(await prisma.sensorReading.count()).toBe(1)
  })

  it("rejects a duplicate (zoneId, sequenceNumber) pair", async () => {
    const { zone } = await createZoneFixture()
    const base = {
      zoneId: zone.id,
      capturedAt: new Date(),
      riskScore: 10,
      calculatedState: "SAFE" as const,
      contributions: { fire: 0, gas: 10, water: 0, occupancy: 0 },
    }

    await prisma.sensorReading.create({
      data: { ...base, readingId: "seq-a", sequenceNumber: 7 },
    })

    await expect(
      prisma.sensorReading.create({
        data: { ...base, readingId: "seq-b", sequenceNumber: 7 },
      })
    ).rejects.toThrow()
  })

  it("allows only one acknowledgment row per incident", async () => {
    const { zone } = await createZoneFixture()
    const incident = await createIncidentFixture(zone.id)
    const user = await prisma.user.create({
      data: {
        name: "Ack Tester",
        email: `ack-${incident.id}@scsrg.local`,
        passwordHash: "x",
        role: "SECURITY_STAFF",
      },
    })

    await prisma.acknowledgment.create({
      data: { incidentId: incident.id, userId: user.id },
    })

    await expect(
      prisma.acknowledgment.create({
        data: { incidentId: incident.id, userId: user.id },
      })
    ).rejects.toThrow()
  })
})
