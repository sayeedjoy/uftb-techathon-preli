import { beforeEach, describe, expect, it } from "vitest"

import { prisma } from "../../database/prisma.js"
import { createZoneFixture, type SeededZone } from "../fixtures/zone.fixture.js"
import { api } from "../helpers/request.js"
import { pushReadings, resetSequence } from "../helpers/ingest.js"

const CRITICAL = {
  fireDetected: true,
  gasLevel: 1,
  occupancyDetected: true,
} as const

describe("actuation", () => {
  let seeded: SeededZone

  beforeEach(async () => {
    resetSequence()
    seeded = await createZoneFixture({ code: "actuation-zone" })
  })

  it("emits one command per actuator on entering CRITICAL, and no more", async () => {
    // Fifty consecutive CRITICAL readings must not mean fifty buzzer commands.
    await pushReadings(seeded, 50, CRITICAL)

    const commands = await prisma.actuationCommand.findMany({
      where: { zoneId: seeded.zone.id },
    })

    expect(
      commands.filter((command) => command.type === "ACTIVATE_BUZZER")
    ).toHaveLength(1)
    expect(
      commands.filter((command) => command.type === "ACTIVATE_RELAY")
    ).toHaveLength(1)
    expect(commands.every((command) => command.source === "SENSOR_TRIGGERED")).toBe(
      true
    )
  })

  it("creates the CRITICAL command within a second of the reading arriving", async () => {
    const before = Date.now()
    await pushReadings(seeded, 5, CRITICAL)

    const command = await prisma.actuationCommand.findFirstOrThrow({
      where: { zoneId: seeded.zone.id, type: "ACTIVATE_BUZZER" },
    })
    const reading = await prisma.sensorReading.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
      orderBy: { receivedAt: "desc" },
    })

    expect(
      command.requestedAt.getTime() - reading.receivedAt.getTime()
    ).toBeLessThan(1000)
    expect(command.requestedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it("keeps two simultaneously critical zones' commands disjoint", async () => {
    const other = await createZoneFixture({ code: "actuation-zone-b" })

    await pushReadings(seeded, 5, CRITICAL)
    await pushReadings(other, 5, CRITICAL)

    const [first, second] = await Promise.all([
      prisma.actuationCommand.findMany({ where: { zoneId: seeded.zone.id } }),
      prisma.actuationCommand.findMany({ where: { zoneId: other.zone.id } }),
    ])

    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
    expect(
      first.some((command) =>
        second.some((otherCommand) => otherCommand.id === command.id)
      )
    ).toBe(false)
  })

  it("issues deactivation commands on recovery", async () => {
    await pushReadings(seeded, 5, CRITICAL)
    await pushReadings(seeded, 6, {
      fireDetected: false,
      gasLevel: 0,
      occupancyDetected: false,
    })

    const commands = await prisma.actuationCommand.findMany({
      where: { zoneId: seeded.zone.id },
      orderBy: { requestedAt: "asc" },
    })
    const types = commands.map((command) => command.type)

    expect(types).toContain("DEACTIVATE_BUZZER")
    expect(types).toContain("DEACTIVATE_RELAY")

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.buzzerActive).toBe(false)
    expect(zone.relayCutoffActive).toBe(false)
    expect(zone.ledColor).toBe("GREEN")
  })

  it("mirrors the desired actuator state onto the zone projection", async () => {
    await pushReadings(seeded, 5, CRITICAL)

    const zone = await prisma.zone.findUniqueOrThrow({
      where: { id: seeded.zone.id },
    })
    expect(zone.ledColor).toBe("RED")
    expect(zone.buzzerActive).toBe(true)
    expect(zone.relayCutoffActive).toBe(true)
  })

  it("lets a node pull and complete its pending commands", async () => {
    await pushReadings(seeded, 5, CRITICAL)

    const pull = await api()
      .get(`/api/v1/ingestion/zones/${seeded.zone.id}/commands`)
      .set("x-zone-api-key", seeded.apiKey)

    expect(pull.status).toBe(200)
    expect(pull.body.data.commands.length).toBeGreaterThan(0)

    const commandId = pull.body.data.commands[0].id
    const complete = await api()
      .post(
        `/api/v1/ingestion/zones/${seeded.zone.id}/commands/${commandId}/complete`
      )
      .set("x-zone-api-key", seeded.apiKey)
      .send({ status: "COMPLETED" })

    expect(complete.status).toBe(200)

    const stored = await prisma.actuationCommand.findUniqueOrThrow({
      where: { id: commandId },
    })
    expect(stored.status).toBe("COMPLETED")
    expect(stored.executedAt).not.toBeNull()
  })

  it("refuses to complete a command belonging to another zone", async () => {
    const other = await createZoneFixture({ code: "actuation-zone-c" })
    await pushReadings(seeded, 5, CRITICAL)

    const command = await prisma.actuationCommand.findFirstOrThrow({
      where: { zoneId: seeded.zone.id },
    })

    const response = await api()
      .post(
        `/api/v1/ingestion/zones/${other.zone.id}/commands/${command.id}/complete`
      )
      .set("x-zone-api-key", other.apiKey)
      .send({ status: "COMPLETED" })

    expect(response.status).toBe(404)
  })
})
