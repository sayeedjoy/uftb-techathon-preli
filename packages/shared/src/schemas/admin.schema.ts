import { z } from "zod"

import {
  OVERRIDE_ACTIONS,
  SENSOR_TYPES,
  SENSOR_STATUS,
} from "../domain/index.js"

export const acknowledgeIncidentSchema = z
  .object({
    note: z.string().trim().max(500).optional(),
  })
  .strict()
export type AcknowledgeIncidentInput = z.infer<typeof acknowledgeIncidentSchema>

/**
 * Every override needs a reason: it is the audit trail's only human context.
 * Five characters is deliberately low friction but rules out "x".
 */
export const overrideSchema = z
  .object({
    action: z.enum(OVERRIDE_ACTIONS),
    reason: z
      .string()
      .trim()
      .min(5, "A reason of at least 5 characters is required")
      .max(500),
    sensorId: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
export type OverrideInput = z.infer<typeof overrideSchema>

const zoneCode = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    "Use lowercase letters, digits and hyphens (e.g. `iot-lab`)"
  )

export const createZoneSchema = z
  .object({
    code: zoneCode,
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    location: z.string().trim().max(200).optional(),
    assetImportance: z.number().int().min(0).max(8),
    sensors: z
      .array(
        z.object({
          type: z.enum(SENSOR_TYPES),
          name: z.string().trim().min(2).max(120),
          isCritical: z.boolean().default(false),
          configuration: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .min(1, "A zone needs at least one sensor"),
  })
  .strict()
export type CreateZoneInput = z.infer<typeof createZoneSchema>

export const updateZoneSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    location: z.string().trim().max(200).nullable().optional(),
    assetImportance: z.number().int().min(0).max(8).optional(),
    isActive: z.boolean().optional(),
    maintenanceMode: z.boolean().optional(),
  })
  .strict()
export type UpdateZoneInput = z.infer<typeof updateZoneSchema>

export const updateSensorSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: z.enum(Object.values(SENSOR_STATUS)).optional(),
    isCritical: z.boolean().optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
export type UpdateSensorInput = z.infer<typeof updateSensorSchema>
