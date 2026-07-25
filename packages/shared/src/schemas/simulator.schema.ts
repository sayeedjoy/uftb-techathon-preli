import { z } from "zod"

/**
 * Control surface for the backend-hosted simulator engine (spec D2).
 * Zone API keys live server-side; nothing here ever carries a credential.
 */
export const simulatorStartSchema = z
  .object({
    intervalMs: z.number().int().min(50).max(60_000).optional(),
  })
  .strict()
export type SimulatorStartInput = z.infer<typeof simulatorStartSchema>

export const simulatorStatePatchSchema = z
  .object({
    fireDetected: z.boolean().optional(),
    gasLevel: z.number().min(0).max(1).optional(),
    waterLevel: z.number().min(0).max(1).optional(),
    occupancyDetected: z.boolean().optional(),
    /** Sensor types this node should report as unavailable. */
    disconnectedSensors: z
      .array(z.enum(["FLAME", "GAS", "WATER", "OCCUPANCY"]))
      .optional(),
    /** Zone-level cut: stop sending entirely, so the zone goes OFFLINE. */
    networkDisconnected: z.boolean().optional(),
    warmupMode: z.boolean().optional(),
    intervalMs: z.number().int().min(50).max(60_000).optional(),
  })
  .strict()
export type SimulatorStatePatchInput = z.infer<typeof simulatorStatePatchSchema>

export const FAULT_INJECTIONS = [
  "MALFORMED_PAYLOAD",
  "DUPLICATE_READING",
  "OUT_OF_ORDER_READING",
  "IMPOSSIBLE_VALUE",
  "QUICK_CYCLE",
] as const
export type FaultInjection = (typeof FAULT_INJECTIONS)[number]

export const simulatorFaultSchema = z
  .object({
    fault: z.enum(FAULT_INJECTIONS),
  })
  .strict()
export type SimulatorFaultInput = z.infer<typeof simulatorFaultSchema>

export const scenarioRunSchema = z
  .object({
    /** Run without waiting between steps — used by the headless test runner. */
    fast: z.boolean().optional(),
    zoneCount: z.number().int().min(1).max(60).optional(),
  })
  .strict()
export type ScenarioRunInput = z.infer<typeof scenarioRunSchema>
