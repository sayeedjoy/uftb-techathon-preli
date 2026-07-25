import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture } from "../fixtures/zone.fixture.js"
import { api, bearer, createAdmin, createUser } from "../helpers/request.js"
import type { TestUser } from "../helpers/request.js"

/**
 * The field-report review lifecycle.
 *
 * A report is inert until an administrator rules on it, and a verdict is cast
 * exactly once. Everything here is the deterministic extractor — the test
 * environment configures no AI key, which is the guaranteed floor rather than a
 * fallback.
 */
describe("field reports · review", () => {
  let staff: TestUser
  let admin: TestUser

  beforeEach(async () => {
    staff = await createUser("SECURITY_STAFF")
    admin = await createAdmin()
    await createZoneFixture({ code: "iot-lab", name: "IoT Lab" })
  })

  async function submit(text = "Smell of gas near the IoT Lab bench") {
    const response = await api()
      .post("/api/v1/reports/natural-language")
      .set("authorization", bearer(staff))
      .send({ text })

    expect(response.status).toBe(201)
    return response.body.data.report as { id: string; status: string }
  }

  it("files a submitted report as PENDING and nothing else", async () => {
    const report = await submit()

    expect(report.status).toBe("PENDING")
    // Advisory only: no incident, no state change, no actuation.
    expect(await prisma.incident.count()).toBe(0)
    expect(await prisma.actuationCommand.count()).toBe(0)
  })

  it("refuses both verdicts to security staff", async () => {
    const report = await submit()

    for (const verdict of ["confirm", "reject"]) {
      const response = await api()
        .post(`/api/v1/reports/${report.id}/${verdict}`)
        .set("authorization", bearer(staff))
        .send({})

      expect(response.status).toBe(403)
      expect(response.body.error.code).toBe("FORBIDDEN")
    }

    const unchanged = await prisma.incidentReport.findUniqueOrThrow({
      where: { id: report.id },
    })
    expect(unchanged.status).toBe("PENDING")
  })

  it("records who approved a report, and when", async () => {
    const report = await submit()

    const response = await api()
      .post(`/api/v1/reports/${report.id}/confirm`)
      .set("authorization", bearer(admin))
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.data.report.status).toBe("CONFIRMED")

    const stored = await prisma.incidentReport.findUniqueOrThrow({
      where: { id: report.id },
    })
    expect(stored.confirmedBy).toBe(admin.id)
    expect(stored.confirmedAt).not.toBeNull()
    expect(
      await prisma.auditLog.count({ where: { action: "REPORT_CONFIRMED" } })
    ).toBe(1)
  })

  it("rejects a pending report and audits it", async () => {
    const report = await submit()

    const response = await api()
      .post(`/api/v1/reports/${report.id}/reject`)
      .set("authorization", bearer(admin))
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.data.report.status).toBe("REJECTED")
    expect(
      await prisma.auditLog.count({ where: { action: "REPORT_REJECTED" } })
    ).toBe(1)
  })

  // Both verdicts are guarded identically: a second administrator arriving late
  // must not be able to overturn a verdict silently, in either direction.
  it.each([
    ["confirm", "reject"],
    ["reject", "confirm"],
  ])("refuses to %s and then %s the same report", async (first, second) => {
    const report = await submit()

    await api()
      .post(`/api/v1/reports/${report.id}/${first}`)
      .set("authorization", bearer(admin))
      .send({})

    const response = await api()
      .post(`/api/v1/reports/${report.id}/${second}`)
      .set("authorization", bearer(admin))
      .send({})

    expect(response.status).toBe(409)

    const stored = await prisma.incidentReport.findUniqueOrThrow({
      where: { id: report.id },
    })
    expect(stored.status).toBe(first === "confirm" ? "CONFIRMED" : "REJECTED")
  })

  it("returns 404 for a verdict on a report that does not exist", async () => {
    const response = await api()
      .post("/api/v1/reports/00000000-0000-4000-8000-000000000000/reject")
      .set("authorization", bearer(admin))
      .send({})

    expect(response.status).toBe(404)
  })

  it("lists reports newest first, filterable by status", async () => {
    const first = await submit("Water pooling under the server rack")
    await submit("Smell of gas near the IoT Lab bench")

    await api()
      .post(`/api/v1/reports/${first.id}/confirm`)
      .set("authorization", bearer(admin))
      .send({})

    const pending = await api()
      .get("/api/v1/reports?status=PENDING")
      .set("authorization", bearer(staff))

    expect(pending.status).toBe(200)
    expect(pending.body.data.reports).toHaveLength(1)
    expect(pending.body.data.reports[0].status).toBe("PENDING")
  })
})
