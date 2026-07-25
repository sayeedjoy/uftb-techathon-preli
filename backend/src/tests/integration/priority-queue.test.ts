import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { api, createUser } from "../helpers/request.js"
import { pushReadings, resetSequence } from "../helpers/ingest.js"

const CRITICAL = {
  fireDetected: true,
  gasLevel: 1,
  occupancyDetected: true,
} as const

describe("GET /priority-queue", () => {
  let low: SeededZone
  let high: SeededZone

  beforeEach(async () => {
    resetSequence()
    low = await createZoneFixture({ code: "queue-low", assetImportance: 2 })
    high = await createZoneFixture({ code: "queue-high", assetImportance: 8 })
  })

  it("returns an empty array — never null — when nothing is critical", async () => {
    const user = await createUser()

    const response = await api()
      .get("/api/v1/priority-queue")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data.queue).toEqual([])
  })

  it("ranks two simultaneous critical zones with explanations", async () => {
    const user = await createUser()
    await pushReadings(low, 5, CRITICAL)
    await pushReadings(high, 5, CRITICAL)

    const response = await api()
      .get("/api/v1/priority-queue")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    const queue = response.body.data.queue
    expect(queue).toHaveLength(2)

    // The higher-value zone outranks the lower one at equal risk.
    expect(queue[0].zoneCode).toBe("queue-high")
    expect(queue[0].rank).toBe(1)
    expect(queue[1].rank).toBe(2)
    expect(queue[0].priorityScore).toBeGreaterThanOrEqual(queue[1].priorityScore)

    // The dashboard must be able to explain the ordering without a detail view.
    expect(queue[0].reasons.length).toBeGreaterThan(0)
    expect(queue[0].breakdown).toMatchObject({
      risk: expect.any(Number),
      occupancy: expect.any(Number),
      asset: 8,
    })
    expect(queue[0].mainHazard).toBeTruthy()
    expect(queue[0].occupancy).toBe("OCCUPIED")
  })

  it("persists the score and explanation onto the incident", async () => {
    const user = await createUser()
    await pushReadings(high, 5, CRITICAL)

    await api()
      .get("/api/v1/priority-queue")
      .set("authorization", `Bearer ${user.token}`)

    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: high.zone.id },
    })
    expect(incident.priorityScore).toBeGreaterThan(0)
    expect(incident.priorityExplanation).not.toBeNull()
  })

  it("demotes an incident once it is acknowledged", async () => {
    const user = await createUser()
    await pushReadings(low, 5, CRITICAL)
    await pushReadings(high, 5, CRITICAL)

    const before = await api()
      .get("/api/v1/priority-queue")
      .set("authorization", `Bearer ${user.token}`)
    const topIncidentId = before.body.data.queue[0].incidentId

    await api()
      .post(`/api/v1/incidents/${topIncidentId}/acknowledge`)
      .set("authorization", `Bearer ${user.token}`)
      .send({})

    const after = await api()
      .get("/api/v1/priority-queue")
      .set("authorization", `Bearer ${user.token}`)

    expect(after.body.data.queue[0].incidentId).not.toBe(topIncidentId)
    const demoted = after.body.data.queue.find(
      (entry: { incidentId: string }) => entry.incidentId === topIncidentId
    )
    expect(demoted.acknowledged).toBe(true)
    expect(demoted.breakdown.acknowledged).toBeLessThan(0)
    expect(demoted.acknowledgedByName).toBe(user.name)
  })

  it("drops a resolved incident out of the queue", async () => {
    const user = await createUser()
    await pushReadings(high, 5, CRITICAL)
    await pushReadings(high, 6, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })

    const response = await api()
      .get("/api/v1/priority-queue")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.body.data.queue).toHaveLength(0)
  })

  it("is stable across repeated reads with unchanged inputs", async () => {
    const user = await createUser()
    await pushReadings(low, 5, CRITICAL)
    await pushReadings(high, 5, CRITICAL)

    const read = async () =>
      (
        await api()
          .get("/api/v1/priority-queue")
          .set("authorization", `Bearer ${user.token}`)
      ).body.data.queue.map((entry: { rank: number; incidentId: string }) => [
        entry.rank,
        entry.incidentId,
      ])

    expect(await read()).toEqual(await read())
  })
})

describe("GET /dashboard/summary", () => {
  it("counts states, incidents and health in one request", async () => {
    resetSequence()
    const user = await createUser()
    const safe = await createZoneFixture({ code: "summary-safe" })
    const critical = await createZoneFixture({ code: "summary-critical" })
    await createZoneFixture({ code: "summary-never-reported" })

    await pushReadings(safe, 2, { gasLevel: 0.05, occupancyDetected: false })
    await pushReadings(critical, 5, CRITICAL)

    const response = await api()
      .get("/api/v1/dashboard/summary")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    const data = response.body.data

    expect(data.totalZones).toBe(3)
    expect(data.stateCounts.SAFE).toBe(1)
    expect(data.stateCounts.CRITICAL).toBe(1)
    // A zone that has never reported is OFFLINE, not SAFE.
    expect(data.stateCounts.OFFLINE).toBe(1)
    expect(data.activeIncidents).toBe(1)
    expect(data.unacknowledgedIncidents).toBe(1)
    expect(data.highestPriorityIncident.zoneCode).toBe("summary-critical")
    expect(data.health.databaseConnected).toBe(true)
  })
})

describe("GET /incidents filters", () => {
  it("filters by zone, status, hazard type and date range", async () => {
    resetSequence()
    const user = await createUser()
    const zone = await createZoneFixture({ code: "filter-zone" })
    const other = await createZoneFixture({ code: "filter-other" })

    await pushReadings(zone, 5, CRITICAL)
    await pushReadings(other, 5, CRITICAL)

    const authorized = () =>
      api().get("/api/v1/incidents").set("authorization", `Bearer ${user.token}`)

    const all = await authorized()
    expect(all.body.data.incidents).toHaveLength(2)
    expect(all.body.meta.total).toBe(2)

    const byZone = await authorized().query({ zoneId: zone.zone.id })
    expect(byZone.body.data.incidents).toHaveLength(1)
    expect(byZone.body.data.incidents[0].zoneCode).toBe("filter-zone")

    const byStatus = await authorized().query({ status: "OPEN" })
    expect(byStatus.body.data.incidents).toHaveLength(2)

    const byHazard = await authorized().query({ hazardType: "FIRE" })
    expect(byHazard.body.data.incidents).toHaveLength(2)

    const inWindow = await authorized().query({
      from: new Date(Date.now() - 60_000).toISOString(),
      to: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(inWindow.body.data.incidents).toHaveLength(2)

    const outsideWindow = await authorized().query({
      from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      to: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    })
    expect(outsideWindow.body.data.incidents).toHaveLength(0)

    const combined = await authorized().query({
      zoneId: zone.zone.id,
      status: "OPEN",
    })
    expect(combined.body.data.incidents).toHaveLength(1)
  })

  it("rejects an inverted date range", async () => {
    const user = await createUser()

    const response = await api()
      .get("/api/v1/incidents")
      .set("authorization", `Bearer ${user.token}`)
      .query({
        from: new Date().toISOString(),
        to: new Date(Date.now() - 86_400_000).toISOString(),
      })

    expect(response.status).toBe(400)
  })

  it("returns 404 for an unknown incident", async () => {
    const user = await createUser()

    const response = await api()
      .get("/api/v1/incidents/00000000-0000-0000-0000-000000000000")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(404)
  })

  it("returns the full timeline for an incident", async () => {
    resetSequence()
    const user = await createUser()
    const zone = await createZoneFixture({ code: "timeline-zone" })
    await pushReadings(zone, 5, CRITICAL)

    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: zone.zone.id },
    })

    const response = await api()
      .get(`/api/v1/incidents/${incident.id}/timeline`)
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data.timeline[0].eventType).toBe("CREATED")
  })
})
