import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { api, createUser, type TestUser } from "../helpers/request.js"
import { pushReadings, resetSequence } from "../helpers/ingest.js"

async function openIncident(seeded: SeededZone): Promise<string> {
  await pushReadings(seeded, 5, {
    fireDetected: true,
    gasLevel: 1,
    occupancyDetected: true,
  })
  const incident = await prisma.incident.findFirstOrThrow({
    where: { zoneId: seeded.zone.id, status: "OPEN" },
  })
  return incident.id
}

describe("acknowledgment concurrency", () => {
  let seeded: SeededZone

  beforeEach(async () => {
    resetSequence()
    seeded = await createZoneFixture({ code: "ack-zone" })
  })

  it("lets exactly one of ten concurrent requests win", async () => {
    const incidentId = await openIncident(seeded)

    const officers: TestUser[] = await Promise.all(
      Array.from({ length: 10 }, () => createUser("SECURITY_STAFF"))
    )

    // Ten requests fired together, not sequentially — the point is the race.
    const responses = await Promise.all(
      officers.map((officer) =>
        api()
          .post(`/api/v1/incidents/${incidentId}/acknowledge`)
          .set("authorization", `Bearer ${officer.token}`)
          .send({ note: `Acknowledged by ${officer.name}` })
      )
    )

    const succeeded = responses.filter((response) => response.status === 200)
    const conflicted = responses.filter((response) => response.status === 409)

    expect(succeeded).toHaveLength(1)
    expect(conflicted).toHaveLength(9)
    for (const response of conflicted) {
      expect(response.body.error.code).toBe("ALREADY_ACKNOWLEDGED")
    }

    // Exactly one row, and it belongs to whoever got the 200.
    const rows = await prisma.acknowledgment.findMany({ where: { incidentId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.userId).toBe(succeeded[0]?.body.data.acknowledgment.userId)

    const incident = await prisma.incident.findUniqueOrThrow({
      where: { id: incidentId },
    })
    expect(incident.status).toBe("ACKNOWLEDGED")
    expect(incident.acknowledgedAt).not.toBeNull()
  })

  it("writes exactly one audit row and one timeline event for the winner", async () => {
    const incidentId = await openIncident(seeded)
    const officers = await Promise.all(
      Array.from({ length: 4 }, () => createUser("SECURITY_STAFF"))
    )

    await Promise.all(
      officers.map((officer) =>
        api()
          .post(`/api/v1/incidents/${incidentId}/acknowledge`)
          .set("authorization", `Bearer ${officer.token}`)
          .send({})
      )
    )

    expect(
      await prisma.auditLog.count({
        where: { action: "INCIDENT_ACKNOWLEDGED", entityId: incidentId },
      })
    ).toBe(1)
    expect(
      await prisma.incidentTimelineEvent.count({
        where: { incidentId, eventType: "ACKNOWLEDGED" },
      })
    ).toBe(1)
  })

  it("preserves the winner's note", async () => {
    const incidentId = await openIncident(seeded)
    const officer = await createUser("SECURITY_STAFF")

    const response = await api()
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set("authorization", `Bearer ${officer.token}`)
      .send({ note: "Heading to the lab with an extinguisher" })

    expect(response.status).toBe(200)
    const row = await prisma.acknowledgment.findUniqueOrThrow({
      where: { incidentId },
    })
    expect(row.note).toBe("Heading to the lab with an extinguisher")
  })

  it("returns 409 for a sequential second acknowledgment", async () => {
    const incidentId = await openIncident(seeded)
    const first = await createUser("SECURITY_STAFF")
    const second = await createUser("SECURITY_STAFF")

    await api()
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set("authorization", `Bearer ${first.token}`)
      .send({})

    const response = await api()
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set("authorization", `Bearer ${second.token}`)
      .send({})

    expect(response.status).toBe(409)
  })

  it("returns 404 for an unknown incident", async () => {
    const officer = await createUser("SECURITY_STAFF")

    const response = await api()
      .post("/api/v1/incidents/00000000-0000-0000-0000-000000000000/acknowledge")
      .set("authorization", `Bearer ${officer.token}`)
      .send({})

    expect(response.status).toBe(404)
  })

  it("refuses to acknowledge a resolved incident", async () => {
    const incidentId = await openIncident(seeded)
    await prisma.incident.update({
      where: { id: incidentId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    })

    const officer = await createUser("SECURITY_STAFF")
    const response = await api()
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .set("authorization", `Bearer ${officer.token}`)
      .send({})

    expect(response.status).toBe(409)
  })

  it("requires authentication", async () => {
    const incidentId = await openIncident(seeded)

    const response = await api()
      .post(`/api/v1/incidents/${incidentId}/acknowledge`)
      .send({})

    expect(response.status).toBe(401)
  })
})
