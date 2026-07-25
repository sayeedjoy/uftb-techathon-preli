import type { Sensor } from "@prisma/client"
import {
  ERROR_CODE,
  SENSOR_TYPE,
  type SensorReadingInput,
  type SensorType,
} from "@scsrg/shared"

import { sensorConfig, type SensorConfig } from "../../config/sensor.config.js"
import { UnprocessableReadingError } from "../../shared/errors.js"

/** Which payload key maps to which configured sensor type. */
const SENSOR_FIELDS = [
  ["fireDetected", SENSOR_TYPE.FLAME],
  ["gasLevel", SENSOR_TYPE.GAS],
  ["waterLevel", SENSOR_TYPE.WATER],
  ["occupancyDetected", SENSOR_TYPE.OCCUPANCY],
] as const

export type SemanticValidationResult = {
  capturedAt: Date
  /** Sensor types this zone has configured. */
  configuredTypes: Set<SensorType>
  /** Types the zone has but the payload omitted — they contribute 0. */
  missingTypes: SensorType[]
}

/**
 * Semantic validation — step 3 of the ingestion pipeline.
 *
 * The distinction the API contract insists on: a wrong *shape* is a `400` and
 * is caught by the Zod schema before this runs. Everything here is a valid
 * shape carrying an impossible value, and is therefore a `422`.
 */
export function validateReadingSemantics(
  payload: SensorReadingInput,
  sensors: Sensor[],
  now: Date,
  config: SensorConfig = sensorConfig
): SemanticValidationResult {
  const capturedAt = new Date(payload.capturedAt)

  if (Number.isNaN(capturedAt.getTime())) {
    throw new UnprocessableReadingError(
      ERROR_CODE.INVALID_TIMESTAMP,
      "`capturedAt` is not a valid ISO-8601 timestamp.",
      [{ path: "capturedAt", message: "Unparseable timestamp" }]
    )
  }

  const skewMs = capturedAt.getTime() - now.getTime()
  if (skewMs > config.maxFutureTimestampSkewMs) {
    throw new UnprocessableReadingError(
      ERROR_CODE.INVALID_TIMESTAMP,
      `\`capturedAt\` is ${Math.round(skewMs / 1000)}s in the future; at most ${Math.round(config.maxFutureTimestampSkewMs / 1000)}s of clock skew is tolerated.`,
      [{ path: "capturedAt", message: "Timestamp too far in the future" }]
    )
  }

  const configuredTypes = new Set<SensorType>(
    sensors.map((sensor) => sensor.type)
  )

  for (const [field, sensorType] of SENSOR_FIELDS) {
    const value = payload.sensors[field]
    if (value === undefined || value === null) continue

    if (!configuredTypes.has(sensorType)) {
      throw new UnprocessableReadingError(
        ERROR_CODE.SENSOR_NOT_CONFIGURED,
        `This zone has no ${sensorType} sensor configured, so \`${field}\` cannot be reported.`,
        [
          {
            path: `sensors.${field}`,
            message: "Sensor not configured for zone",
          },
        ]
      )
    }
  }

  assertUnitInterval(payload.sensors.gasLevel, "gasLevel", "Gas level")
  assertUnitInterval(payload.sensors.waterLevel, "waterLevel", "Water level")

  const missingTypes = [...configuredTypes].filter((type) => {
    const entry = SENSOR_FIELDS.find(([, sensorType]) => sensorType === type)
    if (!entry) return false
    const value = payload.sensors[entry[0]]
    return value === undefined || value === null
  })

  return { capturedAt, configuredTypes, missingTypes }
}

function assertUnitInterval(
  value: number | undefined,
  field: string,
  label: string
): void {
  if (value === undefined) return

  if (!Number.isFinite(value)) {
    throw new UnprocessableReadingError(
      ERROR_CODE.VALUE_OUT_OF_RANGE,
      `${label} must be a finite number between 0 and 1.`,
      [{ path: `sensors.${field}`, message: "Not a finite number" }]
    )
  }

  if (value < 0 || value > 1) {
    throw new UnprocessableReadingError(
      ERROR_CODE.VALUE_OUT_OF_RANGE,
      `${label} must be between 0 and 1 — received ${value}.`,
      [{ path: `sensors.${field}`, message: "Value outside the 0–1 range" }]
    )
  }
}
