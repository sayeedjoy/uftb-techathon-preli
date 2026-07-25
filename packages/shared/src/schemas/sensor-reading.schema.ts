import { z } from "zod"

/**
 * The one payload a sensor node is allowed to send.
 *
 * `.strict()` is the mechanism behind acceptance criterion 2: a node that tries
 * to supply `riskScore`, `state`, `priority` or `incidentStatus` is rejected
 * outright rather than having the field silently ignored. The backend is the
 * sole authority for every computed value.
 */
export const sensorValuesSchema = z
  .object({
    /** Raw flame reading. Debouncing happens server-side. */
    fireDetected: z.boolean().optional(),
    /** Normalised 0..1. Anything outside is a 422, not a clamp. */
    gasLevel: z.number().finite().optional(),
    waterLevel: z.number().finite().optional(),
    /**
     * Omit (or send `null`) when the sensor is unavailable — never send `false`
     * to mean "we don't know". Unknown occupancy is modelled as unavailable.
     */
    occupancyDetected: z.boolean().nullish(),
  })
  .strict()
export type SensorValuesInput = z.infer<typeof sensorValuesSchema>

/** Per-sensor health the node may optionally self-report. */
export const sensorHealthSchema = z
  .record(
    z.string(),
    z.object({
      available: z.boolean(),
      message: z.string().max(200).optional(),
    })
  )
  .optional()

export const sensorReadingSchema = z
  .object({
    readingId: z.string().trim().min(1).max(120),
    sequenceNumber: z.number().int().nonnegative(),
    capturedAt: z.string().trim().min(1),
    sensors: sensorValuesSchema,
    sensorHealth: sensorHealthSchema,
  })
  .strict()
export type SensorReadingInput = z.infer<typeof sensorReadingSchema>

export const heartbeatSchema = z
  .object({
    sentAt: z.string().trim().min(1).optional(),
  })
  .strict()
export type HeartbeatInput = z.infer<typeof heartbeatSchema>

export const commandCompletionSchema = z
  .object({
    status: z.enum(["COMPLETED", "FAILED"]),
    message: z.string().max(500).optional(),
  })
  .strict()
export type CommandCompletionInput = z.infer<typeof commandCompletionSchema>

/** Keys a node may never send. Used for a precise error message. */
export const FORBIDDEN_READING_KEYS = [
  "riskScore",
  "state",
  "priority",
  "priorityScore",
  "incidentStatus",
  "calculatedState",
] as const
