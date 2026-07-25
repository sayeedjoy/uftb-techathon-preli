import type { Prisma, Sensor, Zone } from "@prisma/client"
import {
  SENSOR_STATUS,
  SENSOR_TYPE,
  SYSTEM_EVENT_SEVERITY,
  SYSTEM_EVENT_TYPE,
  VALIDATION_STATUS,
  ZONE_STATE,
  type IngestionResultDto,
  type SensorReadingInput,
  type ZoneState,
} from "@scsrg/shared"

import { logger } from "../../config/logger.js"
import { riskConfig } from "../../config/risk.config.js"
import { sensorConfig } from "../../config/sensor.config.js"
import { prisma } from "../../database/prisma.js"
import { withTransaction, type PrismaTx } from "../../database/transaction.js"
import { DuplicateReadingError, NotFoundError } from "../../shared/errors.js"
import { systemClock, type Clock } from "../../shared/clock.js"
import {
  activeHazardCount,
  computeRisk,
  dominantHazards,
} from "../risk-engine/risk.service.js"
import { recordSystemEvent } from "../system-health/system-event.repository.js"
import { findZoneById, findSensors } from "../zones/zones.repository.js"
import { applyZoneState } from "../zones/zone-state.service.js"
import { fireDebounce } from "./debounce.service.js"
import { occupancy } from "./occupancy.service.js"
import { checkOrdering, isRedundantReading } from "./ordering.service.js"
import { createReading, findLatestAccepted } from "./reading.repository.js"
import { validateReadingSemantics } from "./validation.service.js"
import { gasWarmup } from "./warmup.service.js"
import { waterPhase } from "./water.service.js"
import { publishIngestionOutcome } from "../../realtime/domain-events.js"
import { recalculatePriorityQueue } from "../priority-engine/priority-queue.service.js"

export type IngestReadingContext = {
  zoneId: string
  payload: SensorReadingInput
  clock?: Clock
}

/**
 * Steps 1–16 of the ingestion pipeline (spec §9.2), in the documented order.
 *
 * Auth (step 1) and schema validation (step 2) happen in middleware before this
 * runs. Steps 9–14 are wrapped in one transaction; the broadcast (step 15) is
 * deliberately *outside* it, so a rolled-back transaction never announces
 * itself and no network work holds a database lock open.
 */
export async function ingestReading(
  context: IngestReadingContext
): Promise<IngestionResultDto> {
  const clock = context.clock ?? systemClock
  const receivedAt = clock.now()

  const zone = await findZoneById(context.zoneId)
  if (!zone) throw new NotFoundError("Zone not found.")

  const sensors = await findSensors(zone.id)

  // 3. Semantic validation — impossible values are 422, not 400.
  let semantic
  try {
    semantic = validateReadingSemantics(
      context.payload,
      sensors,
      receivedAt,
      sensorConfig
    )
  } catch (error) {
    await recordSystemEvent({
      type: SYSTEM_EVENT_TYPE.VALIDATION_FAILURE,
      severity: SYSTEM_EVENT_SEVERITY.WARN,
      message: `Rejected reading ${context.payload.readingId} for ${zone.code}: ${
        error instanceof Error ? error.message : "invalid"
      }`,
      zoneId: zone.id,
      metadata: { readingId: context.payload.readingId },
    })
    throw error
  }

  const { capturedAt } = semantic

  // 5. Ordering. A stale reading is stored for audit but never applied.
  const latestAccepted = await findLatestAccepted(zone.id)
  const ordering = checkOrdering(context.payload, capturedAt, latestAccepted)
  const isRedundant = isRedundantReading(context.payload, latestAccepted)

  // 6–7. Normalisation, debounce, warm-up gating.
  const processed = processSensorSignals(zone, sensors, context.payload, clock)

  // 8. Risk fusion (pure).
  const computation = computeRisk(processed.inputs, riskConfig, processed.context)

  const validationStatus = ordering.outOfOrder
    ? VALIDATION_STATUS.ACCEPTED_OUT_OF_ORDER
    : VALIDATION_STATUS.ACCEPTED

  // 9–14. One transaction.
  const outcome = await withTransaction(async (tx) => {
    let reading
    try {
      reading = await createReading(
        {
          readingId: context.payload.readingId,
          zoneId: zone.id,
          sequenceNumber: context.payload.sequenceNumber,
          capturedAt,
          receivedAt,
          fireDetected: context.payload.sensors.fireDetected ?? null,
          gasLevel: context.payload.sensors.gasLevel ?? null,
          waterLevel: context.payload.sensors.waterLevel ?? null,
          occupancyDetected: context.payload.sensors.occupancyDetected ?? null,
          sensorHealth: (context.payload.sensorHealth ??
            {}) as Prisma.InputJsonValue,
          riskScore: computation.riskScore,
          calculatedState: computation.state,
          contributions:
            computation.contributions as unknown as Prisma.InputJsonValue,
          reasons: computation.reasons as unknown as Prisma.InputJsonValue,
          isDuplicate: isRedundant,
          validationStatus,
        },
        tx
      )
    } catch (error) {
      // 4. Duplicate detection rides on the unique constraints, so it stays
      //    correct under concurrency where an application-level lookup would not.
      if (isUniqueViolation(error)) {
        throw new DuplicateReadingError(
          `Reading ${context.payload.readingId} (sequence ${context.payload.sequenceNumber}) has already been recorded for ${zone.code}.`
        )
      }
      throw error
    }

    if (ordering.outOfOrder) {
      // Stored, never applied: no live state, no transition, no incident,
      // no actuation, no timeline entry.
      return {
        reading,
        applied: null,
      }
    }

    await syncSensorStatuses(tx, sensors, processed, receivedAt)

    const applied = await applyZoneState(tx, {
      zone,
      newState: computation.state,
      riskScore: computation.riskScore,
      contributions: computation.contributions,
      reasons: computation.reasons,
      dominantHazards: dominantHazards(computation.contributions),
      activeHazardCount: activeHazardCount(computation.contributions),
      at: receivedAt,
      reason: computation.reasons[0] ?? "Sensor reading processed",
      touchLastReading: true,
    })

    return { reading, applied }
  })

  if (ordering.outOfOrder) {
    await recordSystemEvent({
      type: SYSTEM_EVENT_TYPE.OUT_OF_ORDER_READING,
      severity: SYSTEM_EVENT_SEVERITY.INFO,
      message: `Out-of-order reading ${context.payload.readingId} stored for ${zone.code} but not applied: ${ordering.reason}`,
      zoneId: zone.id,
      metadata: { readingId: context.payload.readingId },
    })
  }

  // 14. Priority recalculation, then 15. broadcast — both after commit.
  if (outcome.applied) {
    const queueChanged =
      outcome.applied.incidentOpened ||
      outcome.applied.incidentResolved ||
      outcome.applied.stateChanged ||
      outcome.applied.newState === ZONE_STATE.CRITICAL

    if (queueChanged) {
      await recalculatePriorityQueue().catch((error: unknown) => {
        logger.error({ err: error }, "Priority recalculation failed")
      })
    }
  }

  await publishIngestionOutcome({
    zoneId: zone.id,
    reading: outcome.reading,
    applied: outcome.applied,
  }).catch((error: unknown) => {
    logger.error({ err: error }, "Broadcasting the ingestion outcome failed")
  })

  return {
    accepted: true,
    readingId: outcome.reading.readingId,
    zoneId: zone.id,
    validationStatus,
    appliedToLiveState: outcome.applied !== null,
    computation,
    zoneState: outcome.applied?.newState ?? (zone.state as ZoneState),
    incidentId: outcome.applied?.incidentId ?? null,
    actuationCommandIds:
      outcome.applied?.commands.map((command) => command.id) ?? [],
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

type ProcessedSignals = {
  inputs: Parameters<typeof computeRisk>[0]
  context: Parameters<typeof computeRisk>[2] & object
  gasStatus: "ONLINE" | "WARMING_UP" | null
  occupancyStatus: "ONLINE" | "UNAVAILABLE" | null
  flameReported: boolean
}

/**
 * Steps 6–7: normalisation, debounce, warm-up and availability handling.
 *
 * A sensor the zone does not have contributes 0 and is reported as such; a
 * sensor the zone *has* but that did not answer is unavailable, which is a
 * different fact from "reported nothing happening".
 */
function processSensorSignals(
  zone: Zone,
  sensors: Sensor[],
  payload: SensorReadingInput,
  clock: Clock
): ProcessedSignals {
  const nowMs = clock.nowMs()
  const configured = new Set(sensors.map((sensor) => sensor.type))
  const notConfigured: Array<"fire" | "gas" | "water" | "occupancy"> = []

  // --- Fire ---
  let fireSignal: 0 | 1 = 0
  let fireStreak: number | undefined
  const flameReported = payload.sensors.fireDetected !== undefined

  if (!configured.has(SENSOR_TYPE.FLAME)) {
    notConfigured.push("fire")
  } else if (flameReported) {
    const state = fireDebounce.push(zone.id, payload.sensors.fireDetected === true)
    fireSignal = state.signal
    fireStreak = state.positiveStreak
  } else {
    const state = fireDebounce.peek(zone.id)
    fireSignal = state.signal
    fireStreak = state.positiveStreak
  }

  // --- Gas ---
  let normalizedGasLevel = 0
  let gasSuppressedByWarmup = false
  let gasWarmupRemainingMs: number | undefined
  let gasStatus: ProcessedSignals["gasStatus"] = null

  if (!configured.has(SENSOR_TYPE.GAS)) {
    notConfigured.push("gas")
  } else if (payload.sensors.gasLevel !== undefined) {
    const gasSensor = sensors.find((sensor) => sensor.type === SENSOR_TYPE.GAS)
    const override = readWarmupOverride(gasSensor)
    const evaluation = gasWarmup.evaluate(
      zone.id,
      payload.sensors.gasLevel,
      nowMs,
      override
    )
    normalizedGasLevel = evaluation.effectiveGasLevel
    gasSuppressedByWarmup = evaluation.suppressed
    gasWarmupRemainingMs = evaluation.remainingMs
    gasStatus = evaluation.suppressed ? "WARMING_UP" : "ONLINE"
  }

  // --- Water ---
  let normalizedWaterLevel = 0
  let phase: ReturnType<typeof waterPhase.classify> | undefined

  if (!configured.has(SENSOR_TYPE.WATER)) {
    notConfigured.push("water")
  } else if (payload.sensors.waterLevel !== undefined) {
    normalizedWaterLevel = payload.sensors.waterLevel
    phase = waterPhase.classify(zone.id, payload.sensors.waterLevel)
  }

  // --- Occupancy ---
  let occupancyFactor: 0 | 1 = 0
  let occupancyUnavailable = false
  let occupancyStatus: ProcessedSignals["occupancyStatus"] = null

  if (!configured.has(SENSOR_TYPE.OCCUPANCY)) {
    notConfigured.push("occupancy")
  } else {
    const evaluation = occupancy.evaluate(
      zone.id,
      payload.sensors.occupancyDetected
    )
    occupancyFactor = evaluation.occupancyFactor
    occupancyUnavailable = evaluation.unavailable
    occupancyStatus = evaluation.unavailable ? "UNAVAILABLE" : "ONLINE"
  }

  return {
    inputs: {
      fireSignal,
      normalizedGasLevel,
      normalizedWaterLevel,
      occupancyFactor,
    },
    context: {
      fireStreak,
      gasSuppressedByWarmup,
      gasWarmupRemainingMs,
      occupancyUnavailable,
      waterPhase: phase,
      sensorNotConfigured: notConfigured.length > 0 ? notConfigured : undefined,
    },
    gasStatus,
    occupancyStatus,
    flameReported,
  }
}

function readWarmupOverride(sensor: Sensor | undefined): number | undefined {
  if (!sensor || typeof sensor.configuration !== "object" || sensor.configuration === null) {
    return undefined
  }
  const value = (sensor.configuration as Record<string, unknown>)
    .warmupMsOverride
  return typeof value === "number" ? value : undefined
}

async function syncSensorStatuses(
  tx: PrismaTx,
  sensors: Sensor[],
  processed: ProcessedSignals,
  at: Date
): Promise<void> {
  for (const sensor of sensors) {
    // A sensor under maintenance keeps that status until an admin clears it.
    if (sensor.status === SENSOR_STATUS.MAINTENANCE) continue

    let status: Sensor["status"] | null
    if (sensor.type === SENSOR_TYPE.GAS && processed.gasStatus) {
      status = processed.gasStatus
    } else if (
      sensor.type === SENSOR_TYPE.OCCUPANCY &&
      processed.occupancyStatus
    ) {
      status = processed.occupancyStatus
    } else if (sensor.type === SENSOR_TYPE.FLAME) {
      status = processed.flameReported
        ? SENSOR_STATUS.ONLINE
        : SENSOR_STATUS.UNAVAILABLE
    } else {
      status = SENSOR_STATUS.ONLINE
    }

    if (!status) continue

    await tx.sensor.update({
      where: { id: sensor.id },
      data: { status, lastSeenAt: at },
    })
  }
}

/** Heartbeat: updates `lastSeenAt` without creating a reading. */
export async function recordHeartbeat(zoneId: string): Promise<Date> {
  const at = new Date()
  await prisma.zone.update({ where: { id: zoneId }, data: { lastSeenAt: at } })
  return at
}
