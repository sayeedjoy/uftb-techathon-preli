import { afterAll, beforeEach } from "vitest"

import { prisma } from "../database/prisma.js"
import { fireDebounce } from "../modules/ingestion/debounce.service.js"
import { occupancy } from "../modules/ingestion/occupancy.service.js"
import { gasWarmup } from "../modules/ingestion/warmup.service.js"
import { waterPhase } from "../modules/ingestion/water.service.js"
import { recoveryTracker } from "../modules/zones/recovery.service.js"
import { simulator } from "../modules/simulator/simulator.engine.js"

/**
 * Tables are truncated before every test rather than after, so a failed test
 * leaves its data behind for inspection while still guaranteeing the next test
 * starts clean. Order-independence is a hard requirement (plan risk R5).
 */
const TABLES = [
  "IncidentReport",
  "ReadingHourlyAggregate",
  "SystemEvent",
  "AuditLog",
  "ManualOverride",
  "ActuationCommand",
  "IncidentTimelineEvent",
  "Acknowledgment",
  "Incident",
  "ZoneStateTransition",
  "SensorReading",
  "Sensor",
  "ZoneCredential",
  "Zone",
  "User",
] as const

export async function truncateAll(): Promise<void> {
  const quoted = TABLES.map((table) => `"public"."${table}"`).join(", ")
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`
  )
}

/**
 * The in-memory caches are rebuildable projections, not state of record — but
 * they *are* process-wide, so a test that left a fire confirmed would leak into
 * the next one. Clearing them mirrors what a restart does.
 */
export function resetInMemoryState(): void {
  fireDebounce.reset()
  occupancy.reset()
  gasWarmup.reset()
  waterPhase.reset()
  recoveryTracker.reset()
  simulator.reset()
}

beforeEach(async () => {
  await truncateAll()
  resetInMemoryState()
})

afterAll(async () => {
  await prisma.$disconnect()
})
