import { describe, expect, it } from "vitest"
import type { SensorReading } from "@prisma/client"
import type { SensorReadingInput } from "@scsrg/shared"

import { checkOrdering, isRedundantReading } from "./ordering.service.js"

function latest(overrides: Partial<SensorReading> = {}): SensorReading {
  return {
    id: "reading-1",
    readingId: "iot-lab-100",
    zoneId: "zone-1",
    sequenceNumber: 100,
    capturedAt: new Date("2026-07-25T10:30:00.000Z"),
    receivedAt: new Date("2026-07-25T10:30:00.100Z"),
    fireDetected: false,
    gasLevel: 0.2,
    waterLevel: null,
    occupancyDetected: true,
    sensorHealth: {},
    riskScore: 20,
    calculatedState: "SAFE",
    contributions: {},
    reasons: [],
    isDuplicate: false,
    validationStatus: "ACCEPTED",
    ...overrides,
  } as SensorReading
}

function payload(overrides: Partial<SensorReadingInput> = {}): SensorReadingInput {
  return {
    readingId: "iot-lab-101",
    sequenceNumber: 101,
    capturedAt: "2026-07-25T10:30:01.000Z",
    sensors: { fireDetected: false, gasLevel: 0.2, occupancyDetected: true },
    ...overrides,
  }
}

describe("checkOrdering", () => {
  it("accepts the first reading for a zone", () => {
    expect(checkOrdering(payload(), new Date(), null).outOfOrder).toBe(false)
  })

  it("accepts a strictly newer reading", () => {
    const verdict = checkOrdering(
      payload(),
      new Date("2026-07-25T10:30:01.000Z"),
      latest()
    )

    expect(verdict.outOfOrder).toBe(false)
  })

  it("flags a lower sequence number", () => {
    const verdict = checkOrdering(
      payload({ sequenceNumber: 99 }),
      new Date("2026-07-25T10:30:05.000Z"),
      latest()
    )

    expect(verdict.outOfOrder).toBe(true)
    expect(verdict.reason).toContain("Sequence number 99")
  })

  it("flags an earlier capture time even with a higher sequence number", () => {
    const verdict = checkOrdering(
      payload({ sequenceNumber: 200 }),
      new Date("2026-07-25T10:29:00.000Z"),
      latest()
    )

    expect(verdict.outOfOrder).toBe(true)
    expect(verdict.reason).toContain("before the latest accepted reading")
  })

  it("accepts a reading with the same timestamp and a higher sequence", () => {
    const verdict = checkOrdering(
      payload({ sequenceNumber: 101 }),
      new Date("2026-07-25T10:30:00.000Z"),
      latest()
    )

    expect(verdict.outOfOrder).toBe(false)
  })
})

describe("isRedundantReading", () => {
  it("is false when there is no previous reading", () => {
    expect(isRedundantReading(payload(), null)).toBe(false)
  })

  it("is true when every sensor value matches the previous reading", () => {
    expect(isRedundantReading(payload(), latest())).toBe(true)
  })

  it("is false when a sensor value changed", () => {
    expect(
      isRedundantReading(
        payload({ sensors: { fireDetected: true, gasLevel: 0.2, occupancyDetected: true } }),
        latest()
      )
    ).toBe(false)
  })

  it("treats an omitted value and an explicit null as the same", () => {
    expect(
      isRedundantReading(
        payload({ sensors: { fireDetected: false, gasLevel: 0.2, occupancyDetected: true } }),
        latest({ waterLevel: null })
      )
    ).toBe(true)
  })
})
