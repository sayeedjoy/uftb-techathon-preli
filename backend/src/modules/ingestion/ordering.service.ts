import type { SensorReading } from "@prisma/client"
import type { SensorReadingInput } from "@scsrg/shared"

export type OrderingVerdict = {
  /** True when this reading predates the latest accepted one. */
  outOfOrder: boolean
  reason: string | null
}

/**
 * Ordering check — step 5 of the ingestion pipeline.
 *
 * An out-of-order reading is still *valid data*: it is stored with its computed
 * risk for audit, but it must never move live state, create a transition, open
 * an incident, or issue actuation. Otherwise a late-arriving stale packet could
 * silently un-do a real alarm.
 *
 * Both clocks are checked. `capturedAt` is the sensor's own view of time and can
 * drift; `sequenceNumber` is monotonic per node and is the stronger signal, so
 * either being behind is enough to demote the reading.
 */
export function checkOrdering(
  payload: SensorReadingInput,
  capturedAt: Date,
  latestAccepted: SensorReading | null
): OrderingVerdict {
  if (!latestAccepted) {
    return { outOfOrder: false, reason: null }
  }

  if (payload.sequenceNumber < latestAccepted.sequenceNumber) {
    return {
      outOfOrder: true,
      reason: `Sequence number ${payload.sequenceNumber} is below the latest accepted reading (${latestAccepted.sequenceNumber})`,
    }
  }

  if (capturedAt.getTime() < latestAccepted.capturedAt.getTime()) {
    return {
      outOfOrder: true,
      reason: `Captured at ${capturedAt.toISOString()}, before the latest accepted reading (${latestAccepted.capturedAt.toISOString()})`,
    }
  }

  return { outOfOrder: false, reason: null }
}

/**
 * "Nothing changed since the last accepted reading."
 *
 * This is *not* the duplicate-rejection mechanism — exact duplicates are
 * refused by the database unique constraints and never reach here. This flag
 * marks an accepted reading whose payload was byte-identical to its
 * predecessor, so the timeline can suppress redundant noise.
 */
export function isRedundantReading(
  payload: SensorReadingInput,
  latestAccepted: SensorReading | null
): boolean {
  if (!latestAccepted) return false

  const same = (a: unknown, b: unknown) =>
    (a ?? null) === (b ?? null)

  return (
    same(payload.sensors.fireDetected, latestAccepted.fireDetected) &&
    same(payload.sensors.gasLevel, latestAccepted.gasLevel) &&
    same(payload.sensors.waterLevel, latestAccepted.waterLevel) &&
    same(payload.sensors.occupancyDetected, latestAccepted.occupancyDetected)
  )
}
