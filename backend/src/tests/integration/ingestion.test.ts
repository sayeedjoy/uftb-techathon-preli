import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { api, createAdmin, createUser, readingPayload } from "../helpers/request.js"
import { pushReading, pushReadings, resetSequence } from "../helpers/ingest.js"

describe("POST /ingestion/zones/:zoneId/readings", () => {
  let seeded: SeededZone

  beforeEach(async () => {
    resetSequence()
    seeded = await createZoneFixture({ code: "ingest-zone", assetImportance: 5 })
  })

  function post(body: object, apiKey = seeded.apiKey) {
    return api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .set("x-zone-api-key", apiKey)
      .send(body)
  }

  it("accepts a raw reading and persists the backend's computed verdict", async () => {
    const response = await post(
      readingPayload({
        sequenceNumber: 1,
        sensors: { fireDetected: false, gasLevel: 0.7, occupancyDetected: true },
      })
    )

    expect(response.status).toBe(201)
    expect(response.body.data.computation.riskScore).toBe(32.5)
    expect(response.body.data.computation.state).toBe("WARNING")
    expect(response.body.data.computation.contributions).toEqual({
      fire: 0,
      gas: 17.5,
      water: 0,
      occupancy: 15,
    })

    const stored = await prisma.sensorReading.findUnique({
      where: { readingId: response.body.data.readingId },
    })
    expect(stored?.riskScore).toBe(32.5)
    expect(stored?.calculatedState).toBe("WARNING")
    expect(stored?.validationStatus).toBe("ACCEPTED")
  })

  it("never trusts a client-supplied risk score", async () => {
    const response = await post({
      ...readingPayload({ sequenceNumber: 2, sensors: { gasLevel: 0.1 } }),
      riskScore: 99,
      state: "CRITICAL",
    })

    expect(response.status).toBe(400)
    expect(await prisma.sensorReading.count()).toBe(0)
  })

  it("rejects a malformed payload with 400", async () => {
    const response = await post({
      readingId: "",
      sequenceNumber: "not-a-number",
      sensors: { gasLevel: "high" },
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe("VALIDATION_ERROR")
  })

  it.each([
    ["negative gas", { gasLevel: -0.1 }],
    ["gas above 1", { gasLevel: 1.5 }],
  ])("rejects %s with 422", async (_label, sensors) => {
    const response = await post(readingPayload({ sequenceNumber: 3, sensors }))

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe("VALUE_OUT_OF_RANGE")
    expect(await prisma.sensorReading.count()).toBe(0)
  })

  it("rejects a value for a sensor the zone does not have", async () => {
    const response = await post(
      readingPayload({ sequenceNumber: 4, sensors: { waterLevel: 0.5 } })
    )

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe("SENSOR_NOT_CONFIGURED")
  })

  it("rejects an excessively future timestamp", async () => {
    const response = await post(
      readingPayload({
        sequenceNumber: 5,
        capturedAt: new Date(Date.now() + 600_000).toISOString(),
        sensors: { gasLevel: 0.1 },
      })
    )

    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe("INVALID_TIMESTAMP")
  })

  it("writes a SystemEvent for every rejection", async () => {
    await post(readingPayload({ sequenceNumber: 6, sensors: { gasLevel: 9 } }))

    const events = await prisma.systemEvent.findMany({
      where: { type: "VALIDATION_FAILURE" },
    })
    expect(events.length).toBe(1)
  })

  it("rejects a duplicate readingId with 409 and keeps exactly one row", async () => {
    const payload = readingPayload({
      readingId: "dup-reading",
      sequenceNumber: 10,
      sensors: { gasLevel: 0.2 },
    })

    expect((await post(payload)).status).toBe(201)

    const second = await post({ ...payload, sequenceNumber: 11 })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe("DUPLICATE_READING")

    expect(
      await prisma.sensorReading.count({ where: { readingId: "dup-reading" } })
    ).toBe(1)
  })

  it("rejects a duplicate (zone, sequenceNumber) pair with 409", async () => {
    await post(readingPayload({ readingId: "seq-a", sequenceNumber: 20 }))

    const second = await post(
      readingPayload({ readingId: "seq-b", sequenceNumber: 20 })
    )

    expect(second.status).toBe(409)
    expect(await prisma.sensorReading.count()).toBe(1)
  })

  it("stores an out-of-order reading without moving live state", async () => {
    await post(
      readingPayload({
        readingId: "fresh",
        sequenceNumber: 100,
        capturedAt: new Date().toISOString(),
        sensors: { gasLevel: 0.4, occupancyDetected: true },
      })
    )

    const zoneAfterFresh = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    const transitionsBefore = await prisma.zoneStateTransition.count({
      where: { zoneId: seeded.zone.id },
    })

    const stale = await post(
      readingPayload({
        readingId: "stale",
        sequenceNumber: 50,
        capturedAt: new Date(Date.now() - 120_000).toISOString(),
        sensors: { fireDetected: true, gasLevel: 1, occupancyDetected: true },
      })
    )

    expect(stale.status).toBe(201)
    expect(stale.body.data.validationStatus).toBe("ACCEPTED_OUT_OF_ORDER")
    expect(stale.body.data.appliedToLiveState).toBe(false)

    const storedStale = await prisma.sensorReading.findUnique({
      where: { readingId: "stale" },
    })
    expect(storedStale).not.toBeNull()
    expect(storedStale?.validationStatus).toBe("ACCEPTED_OUT_OF_ORDER")

    const zoneAfterStale = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zoneAfterStale.state).toBe(zoneAfterFresh.state)
    expect(zoneAfterStale.currentRiskScore).toBe(zoneAfterFresh.currentRiskScore)

    expect(
      await prisma.zoneStateTransition.count({ where: { zoneId: seeded.zone.id } })
    ).toBe(transitionsBefore)
    expect(await prisma.incident.count()).toBe(0)
  })

  it("marks a byte-identical follow-up reading as redundant", async () => {
    const sensors = { fireDetected: false, gasLevel: 0.2, occupancyDetected: true }
    await post(readingPayload({ readingId: "r1", sequenceNumber: 1, sensors }))
    await post(readingPayload({ readingId: "r2", sequenceNumber: 2, sensors }))

    const second = await prisma.sensorReading.findUnique({
      where: { readingId: "r2" },
    })
    expect(second?.isDuplicate).toBe(true)
  })

  it("writes a transition only when the state actually changes", async () => {
    await pushReadings(seeded, 3, { gasLevel: 0.1, occupancyDetected: false })

    const transitions = await prisma.zoneStateTransition.findMany({
      where: { zoneId: seeded.zone.id },
    })

    // OFFLINE (initial) → SAFE, and nothing more.
    expect(transitions).toHaveLength(1)
    expect(transitions[0]?.newState).toBe("SAFE")
  })
})

describe("zone API-key authentication", () => {
  let seeded: SeededZone

  beforeEach(async () => {
    seeded = await createZoneFixture({ code: "auth-zone" })
  })

  it("rejects a missing key", async () => {
    const response = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .send(readingPayload())

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe("INVALID_ZONE_KEY")
  })

  it("rejects an invalid key", async () => {
    const response = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .set("x-zone-api-key", "definitely-wrong")
      .send(readingPayload())

    expect(response.status).toBe(401)
  })

  it("rejects a revoked key", async () => {
    await prisma.zoneCredential.updateMany({
      where: { zoneId: seeded.zone.id },
      data: { revokedAt: new Date() },
    })

    const response = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .set("x-zone-api-key", seeded.apiKey)
      .send(readingPayload())

    expect(response.status).toBe(401)
  })

  it("rejects a key that belongs to a different zone", async () => {
    const other = await createZoneFixture({ code: "other-zone" })

    const response = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .set("x-zone-api-key", other.apiKey)
      .send(readingPayload())

    expect(response.status).toBe(401)
  })

  it("refuses ingestion for a deactivated zone", async () => {
    await prisma.zone.update({
      where: { id: seeded.zone.id },
      data: { isActive: false },
    })

    const response = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .set("x-zone-api-key", seeded.apiKey)
      .send(readingPayload())

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe("ZONE_INACTIVE")
  })

  it("does not accept a dashboard JWT in place of a zone key", async () => {
    const admin = await createAdmin()

    const response = await api()
      .post(`/api/v1/ingestion/zones/${seeded.zone.id}/readings`)
      .set("authorization", `Bearer ${admin.token}`)
      .send(readingPayload())

    expect(response.status).toBe(401)
  })

  it("does not accept a zone key on a dashboard route", async () => {
    const response = await api()
      .get("/api/v1/zones")
      .set("x-zone-api-key", seeded.apiKey)

    expect(response.status).toBe(401)
  })
})

describe("GET /zones", () => {
  it("returns every zone's current status in one request", async () => {
    const user = await createUser()
    const a = await createZoneFixture({ code: "zone-a" })
    await createZoneFixture({ code: "zone-b" })
    await createZoneFixture({ code: "zone-c" })

    await pushReading(a, { gasLevel: 0.2, occupancyDetected: true })

    const response = await api()
      .get("/api/v1/zones")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(200)
    expect(response.body.data.zones).toHaveLength(3)

    const zoneA = response.body.data.zones.find(
      (zone: { code: string }) => zone.code === "zone-a"
    )
    expect(zoneA.state).toBe("SAFE")
    expect(zoneA.sensors.length).toBeGreaterThan(0)
    expect(zoneA.actuators).toBeDefined()
  })

  it("returns 404 for an unknown zone", async () => {
    const user = await createUser()

    const response = await api()
      .get("/api/v1/zones/00000000-0000-0000-0000-000000000000")
      .set("authorization", `Bearer ${user.token}`)

    expect(response.status).toBe(404)
  })

  it("restricts raw readings to admins", async () => {
    const staff = await createUser("SECURITY_STAFF")
    const zone = await createZoneFixture({ code: "raw-zone" })

    const response = await api()
      .get(`/api/v1/zones/${zone.zone.id}/readings`)
      .set("authorization", `Bearer ${staff.token}`)

    expect(response.status).toBe(403)
  })
})
