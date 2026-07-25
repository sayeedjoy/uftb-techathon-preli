import { ingestReading } from "../../modules/ingestion/ingestion.service.js"
import type { SeededZone } from "../fixtures/zone.fixture.js"

let sequence = 0

/**
 * Drives readings straight through the ingestion service.
 *
 * Bypassing HTTP here is deliberate: these tests are about the *pipeline*
 * (debounce, incident lifecycle, actuation), and the auth path has its own
 * dedicated coverage. Tests that care about status codes use Supertest.
 */
export async function pushReading(
  seeded: SeededZone,
  sensors: {
    fireDetected?: boolean
    gasLevel?: number
    waterLevel?: number
    occupancyDetected?: boolean | null
  },
  options: {
    capturedAt?: Date
    sequenceNumber?: number
    readingId?: string
  } = {}
) {
  sequence += 1
  const sequenceNumber = options.sequenceNumber ?? sequence

  return ingestReading({
    zoneId: seeded.zone.id,
    payload: {
      readingId:
        options.readingId ??
        `seq-${seeded.zone.code}-${sequenceNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sequenceNumber,
      capturedAt: (options.capturedAt ?? new Date()).toISOString(),
      sensors,
    },
  })
}

/** Repeats the same reading N times — how a real node confirms a signal. */
export async function pushReadings(
  seeded: SeededZone,
  count: number,
  sensors: Parameters<typeof pushReading>[1]
) {
  let last
  for (let i = 0; i < count; i += 1) {
    last = await pushReading(seeded, sensors)
  }
  return last
}

export function resetSequence(): void {
  sequence = 0
}
