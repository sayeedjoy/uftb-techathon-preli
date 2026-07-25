import { describe, expect, it } from "vitest"
import type { Sensor } from "@prisma/client"
import { sensorReadingSchema, type SensorReadingInput } from "@scsrg/shared"

import type { SensorConfig } from "../../config/sensor.config.js"
import { AppError } from "../../shared/errors.js"
import { validateReadingSemantics } from "./validation.service.js"

const config: SensorConfig = {
  fireDebounceConsecutive: 5,
  fireClearConsecutive: 5,
  gasWarmupMs: 5_000,
  occupancyDebounceReadings: 3,
  maxFutureTimestampSkewMs: 5_000,
  water: { dryBelow: 0.15, criticalAtOrAbove: 0.6, resetBelow: 0.1 },
}

const NOW = new Date("2026-07-25T10:30:00.000Z")

function sensor(type: Sensor["type"]): Sensor {
  return {
    id: `sensor-${type}`,
    zoneId: "zone-1",
    type,
    name: `${type} sensor`,
    status: "ONLINE",
    isCritical: type === "FLAME",
    lastSeenAt: null,
    configuration: {},
    warmupStartedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

const SENSORS = [sensor("FLAME"), sensor("GAS"), sensor("OCCUPANCY")]

function payload(
  overrides: Partial<SensorReadingInput> = {}
): SensorReadingInput {
  return {
    readingId: "iot-lab-1042",
    sequenceNumber: 1042,
    capturedAt: "2026-07-25T10:30:00.000Z",
    sensors: { fireDetected: false, gasLevel: 0.2, occupancyDetected: true },
    ...overrides,
  }
}

function expectCode(fn: () => unknown, code: string, status: number) {
  try {
    fn()
    throw new Error("Expected the call to throw")
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(code)
    expect((error as AppError).statusCode).toBe(status)
  }
}

describe("sensorReadingSchema (shape — 400 territory)", () => {
  it("accepts the specification's example payload", () => {
    const parsed = sensorReadingSchema.safeParse({
      readingId: "iot-lab-1042",
      sequenceNumber: 1042,
      capturedAt: "2026-07-25T10:30:15.000Z",
      sensors: {
        fireDetected: true,
        gasLevel: 0.72,
        waterLevel: 0,
        occupancyDetected: true,
      },
    })

    expect(parsed.success).toBe(true)
  })

  it("rejects a node that tries to supply its own risk score", () => {
    const parsed = sensorReadingSchema.safeParse({
      readingId: "x",
      sequenceNumber: 1,
      capturedAt: "2026-07-25T10:30:15.000Z",
      riskScore: 90,
      sensors: { fireDetected: true },
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects a node that tries to supply its own state", () => {
    const parsed = sensorReadingSchema.safeParse({
      readingId: "x",
      sequenceNumber: 1,
      capturedAt: "2026-07-25T10:30:15.000Z",
      sensors: { fireDetected: true, state: "CRITICAL" },
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects a non-numeric gas level as a shape error", () => {
    const parsed = sensorReadingSchema.safeParse({
      readingId: "x",
      sequenceNumber: 1,
      capturedAt: "2026-07-25T10:30:15.000Z",
      sensors: { gasLevel: "high" },
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects a missing readingId", () => {
    const parsed = sensorReadingSchema.safeParse({
      sequenceNumber: 1,
      capturedAt: "2026-07-25T10:30:15.000Z",
      sensors: {},
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts a null occupancy reading as 'unavailable'", () => {
    const parsed = sensorReadingSchema.safeParse({
      readingId: "x",
      sequenceNumber: 1,
      capturedAt: "2026-07-25T10:30:15.000Z",
      sensors: { occupancyDetected: null },
    })

    expect(parsed.success).toBe(true)
  })
})

describe("validateReadingSemantics (values — 422 territory)", () => {
  it("accepts a well-formed reading", () => {
    const result = validateReadingSemantics(payload(), SENSORS, NOW, config)

    expect(result.capturedAt.toISOString()).toBe("2026-07-25T10:30:00.000Z")
    expect(result.configuredTypes.has("GAS")).toBe(true)
  })

  it("rejects a negative gas level", () => {
    expectCode(
      () =>
        validateReadingSemantics(
          payload({ sensors: { gasLevel: -0.1 } }),
          SENSORS,
          NOW,
          config
        ),
      "VALUE_OUT_OF_RANGE",
      422
    )
  })

  it("rejects a gas level above 1", () => {
    expectCode(
      () =>
        validateReadingSemantics(
          payload({ sensors: { gasLevel: 1.5 } }),
          SENSORS,
          NOW,
          config
        ),
      "VALUE_OUT_OF_RANGE",
      422
    )
  })

  it("rejects a negative water level", () => {
    const withWater = [...SENSORS, sensor("WATER")]
    expectCode(
      () =>
        validateReadingSemantics(
          payload({ sensors: { waterLevel: -0.001 } }),
          withWater,
          NOW,
          config
        ),
      "VALUE_OUT_OF_RANGE",
      422
    )
  })

  it("accepts the exact interval endpoints", () => {
    const withWater = [...SENSORS, sensor("WATER")]

    expect(() =>
      validateReadingSemantics(
        payload({ sensors: { gasLevel: 0, waterLevel: 1 } }),
        withWater,
        NOW,
        config
      )
    ).not.toThrow()
  })

  it("rejects an unparseable timestamp", () => {
    expectCode(
      () =>
        validateReadingSemantics(
          payload({ capturedAt: "not-a-date" }),
          SENSORS,
          NOW,
          config
        ),
      "INVALID_TIMESTAMP",
      422
    )
  })

  it("rejects a timestamp too far in the future", () => {
    expectCode(
      () =>
        validateReadingSemantics(
          payload({ capturedAt: "2026-07-25T10:35:00.000Z" }),
          SENSORS,
          NOW,
          config
        ),
      "INVALID_TIMESTAMP",
      422
    )
  })

  it("tolerates skew inside the configured window", () => {
    expect(() =>
      validateReadingSemantics(
        payload({ capturedAt: "2026-07-25T10:30:04.000Z" }),
        SENSORS,
        NOW,
        config
      )
    ).not.toThrow()
  })

  it("accepts an old timestamp — ordering is handled separately", () => {
    expect(() =>
      validateReadingSemantics(
        payload({ capturedAt: "2026-07-20T10:30:00.000Z" }),
        SENSORS,
        NOW,
        config
      )
    ).not.toThrow()
  })

  it("rejects a value for a sensor the zone does not have", () => {
    expectCode(
      () =>
        validateReadingSemantics(
          payload({ sensors: { waterLevel: 0.4 } }),
          SENSORS,
          NOW,
          config
        ),
      "SENSOR_NOT_CONFIGURED",
      422
    )
  })

  it("reports configured sensors the payload omitted", () => {
    const result = validateReadingSemantics(
      payload({ sensors: { fireDetected: true } }),
      SENSORS,
      NOW,
      config
    )

    expect(result.missingTypes).toEqual(
      expect.arrayContaining(["GAS", "OCCUPANCY"])
    )
  })
})
