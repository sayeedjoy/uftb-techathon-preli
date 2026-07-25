import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import {
  api,
  createAdmin,
  createUser,
  readingPayload,
  type TestUser,
} from "../helpers/request.js"
import { pushReadings, resetSequence } from "../helpers/ingest.js"

describe("admin RBAC", () => {
  let staff: TestUser
  let admin: TestUser
  let zone: SeededZone

  beforeEach(async () => {
    resetSequence()
    staff = await createUser("SECURITY_STAFF")
    admin = await createAdmin()
    zone = await createZoneFixture({ code: "admin-zone" })
  })

  /** Every admin endpoint, asserted individually — criterion 15. */
  const adminRoutes: Array<
    [string, "get" | "post" | "patch", string, object | undefined]
  > = [
    ["list users", "get", "/api/v1/admin/users", undefined],
    ["system health", "get", "/api/v1/admin/system-health", undefined],
    ["audit logs", "get", "/api/v1/admin/audit-logs", undefined],
    [
      "create zone",
      "post",
      "/api/v1/admin/zones",
      {
        code: "denied-zone",
        name: "Denied",
        assetImportance: 1,
        sensors: [{ type: "FLAME", name: "Flame", isCritical: true }],
      },
    ],
  ]

  it.each(adminRoutes)(
    "refuses a security-staff token on %s",
    async (_label, method, path, body) => {
      const agent = api()
      const request = agent[method](path).set(
        "authorization",
        `Bearer ${staff.token}`
      )

      const response = body ? await request.send(body) : await request

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe("FORBIDDEN")
    }
  )

  it("refuses a staff token on zone-scoped admin routes", async () => {
    const patchZone = await api()
      .patch(`/api/v1/admin/zones/${zone.zone.id}`)
      .set("authorization", `Bearer ${staff.token}`)
      .send({ name: "Renamed" })
    expect(patchZone.status).toBe(403)

    const override = await api()
      .post(`/api/v1/admin/zones/${zone.zone.id}/overrides`)
      .set("authorization", `Bearer ${staff.token}`)
      .send({ action: "SILENCE_BUZZER", reason: "Should never apply" })
    expect(override.status).toBe(403)

    const zoneHealth = await api()
      .get(`/api/v1/zones/${zone.zone.id}/system-health`)
      .set("authorization", `Bearer ${staff.token}`)
    expect(zoneHealth.status).toBe(403)

    const simulator = await api()
      .get("/api/v1/simulator/status")
      .set("authorization", `Bearer ${staff.token}`)
    expect(simulator.status).toBe(403)
  })

  it("creates a zone whose returned key works immediately — no code change needed", async () => {
    const response = await api()
      .post("/api/v1/admin/zones")
      .set("authorization", `Bearer ${admin.token}`)
      .send({
        code: "new-wing",
        name: "New Wing",
        assetImportance: 4,
        sensors: [
          { type: "FLAME", name: "Flame detector", isCritical: true },
          { type: "GAS", name: "Gas sensor", isCritical: false },
        ],
      })

    expect(response.status).toBe(201)
    const apiKey = response.body.data.apiKey
    expect(apiKey).toBeTypeOf("string")

    const newZoneId = response.body.data.zone.id
    const ingest = await api()
      .post(`/api/v1/ingestion/zones/${newZoneId}/readings`)
      .set("x-zone-api-key", apiKey)
      .send(
        readingPayload({
          sequenceNumber: 1,
          sensors: { fireDetected: false, gasLevel: 0.5 },
        })
      )

    expect(ingest.status).toBe(201)
    expect(ingest.body.data.computation.riskScore).toBe(12.5)
  })

  it("stores only the hash of a generated key", async () => {
    const response = await api()
      .post("/api/v1/admin/zones")
      .set("authorization", `Bearer ${admin.token}`)
      .send({
        code: "hash-zone",
        name: "Hash Zone",
        assetImportance: 1,
        sensors: [{ type: "FLAME", name: "Flame", isCritical: true }],
      })

    const credential = await prisma.zoneCredential.findFirstOrThrow({
      where: { zoneId: response.body.data.zone.id },
    })
    expect(credential.apiKeyHash).not.toBe(response.body.data.apiKey)
    expect(credential.apiKeyHash.startsWith("$2")).toBe(true)
  })

  it("deactivates rather than deletes, and blocks a hard delete with incidents", async () => {
    await pushReadings(zone, 5, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })

    await expect(
      prisma.zone.delete({ where: { id: zone.zone.id } })
    ).rejects.toThrow()

    const response = await api()
      .patch(`/api/v1/admin/zones/${zone.zone.id}`)
      .set("authorization", `Bearer ${admin.token}`)
      .send({ isActive: false })

    expect(response.status).toBe(200)
    const after = await prisma.zone.findUniqueOrThrow({
      where: { id: zone.zone.id },
    })
    expect(after.isActive).toBe(false)
  })

  it("refuses to demote the last administrator", async () => {
    const response = await api()
      .patch(`/api/v1/admin/users/${admin.id}/role`)
      .set("authorization", `Bearer ${admin.token}`)
      .send({ role: "SECURITY_STAFF" })

    expect(response.status).toBe(400)
    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: admin.id },
    })
    expect(unchanged.role).toBe("ADMIN")
  })

  it("allows demotion when another admin remains", async () => {
    const second = await createAdmin()

    const response = await api()
      .patch(`/api/v1/admin/users/${second.id}/role`)
      .set("authorization", `Bearer ${admin.token}`)
      .send({ role: "SECURITY_STAFF" })

    expect(response.status).toBe(200)
    expect(response.body.data.user.role).toBe("SECURITY_STAFF")
  })
})

describe("manual overrides", () => {
  let admin: TestUser
  let zone: SeededZone

  beforeEach(async () => {
    resetSequence()
    admin = await createAdmin()
    zone = await createZoneFixture({ code: "override-zone" })
  })

  function override(body: object) {
    return api()
      .post(`/api/v1/admin/zones/${zone.zone.id}/overrides`)
      .set("authorization", `Bearer ${admin.token}`)
      .send(body)
  }

  it("requires a reason of at least five characters", async () => {
    const response = await override({ action: "SILENCE_BUZZER", reason: "x" })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe("VALIDATION_ERROR")
    expect(await prisma.manualOverride.count()).toBe(0)
  })

  it("writes exactly one ManualOverride and one AuditLog row", async () => {
    const response = await override({
      action: "FORCE_MAINTENANCE_MODE",
      reason: "Scheduled electrical work in the lab",
    })

    expect(response.status).toBe(201)
    expect(await prisma.manualOverride.count()).toBe(1)
    expect(
      await prisma.auditLog.count({
        where: { action: "OVERRIDE_FORCE_MAINTENANCE_MODE" },
      })
    ).toBe(1)

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { action: "OVERRIDE_FORCE_MAINTENANCE_MODE" },
    })
    expect(auditRow.userId).toBe(admin.id)
    expect(auditRow.entityId).toBe(zone.zone.id)
  })

  it("tags a resulting command as a manual action", async () => {
    await pushReadings(zone, 5, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })

    await override({
      action: "SILENCE_BUZZER",
      reason: "Confirmed drill, silencing while we investigate",
    })

    const command = await prisma.actuationCommand.findFirstOrThrow({
      where: { zoneId: zone.zone.id, type: "DEACTIVATE_BUZZER" },
    })
    expect(command.source).toBe("MANUAL_OVERRIDE")

    const after = await prisma.zone.findUniqueOrThrow({
      where: { id: zone.zone.id },
    })
    expect(after.buzzerActive).toBe(false)
  })

  it("keeps ingesting in maintenance mode while suppressing incidents", async () => {
    await override({
      action: "FORCE_MAINTENANCE_MODE",
      reason: "Bench testing the flame detector",
    })

    const refreshed = {
      ...zone,
      zone: await prisma.zone.findUniqueOrThrow({
        where: { id: zone.zone.id },
      }),
    }
    await pushReadings(refreshed, 6, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })

    expect(
      await prisma.sensorReading.count({ where: { zoneId: zone.zone.id } })
    ).toBe(6)
    expect(await prisma.incident.count()).toBe(0)
    expect(await prisma.actuationCommand.count()).toBe(0)
  })

  it("records the override on an open incident's timeline", async () => {
    await pushReadings(zone, 5, {
      fireDetected: true,
      gasLevel: 1,
      occupancyDetected: true,
    })
    const incident = await prisma.incident.findFirstOrThrow({
      where: { zoneId: zone.zone.id },
    })

    await override({
      action: "TEST_ACTUATION",
      reason: "Verifying the relay responds under load",
    })

    const event = await prisma.incidentTimelineEvent.findFirst({
      where: { incidentId: incident.id, eventType: "OVERRIDE_APPLIED" },
    })
    expect(event?.message).toContain("TEST_ACTUATION")
  })
})
