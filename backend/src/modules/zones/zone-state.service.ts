import type { ActuationCommand, Prisma, Zone } from "@prisma/client"
import {
  ACTUATION_SOURCE,
  INCIDENT_TIMELINE_EVENT_TYPE,
  ZONE_STATE,
  type ActuationSource,
  type HazardType,
  type RiskContributions,
  type ZoneState,
} from "@scsrg/shared"

import type { PrismaTx } from "../../database/transaction.js"
import {
  diffActuation,
  resolveDesiredActuation,
  type ActuatorState,
} from "../actuation/actuation.resolver.js"
import { createCommand } from "../actuation/actuation.repository.js"
import {
  createIncident,
  findActiveIncident,
  resolveIncident,
  updateIncident,
} from "../incidents/incident.repository.js"
import { appendTimelineEvent } from "../incidents/timeline.repository.js"
import { recoveryTracker } from "./recovery.service.js"

export type ApplyStateInput = {
  zone: Zone
  newState: ZoneState
  riskScore: number
  contributions: RiskContributions
  reasons: string[]
  dominantHazards: HazardType[]
  activeHazardCount: number
  at: Date
  /** Why the state changed, for the transition row. */
  reason: string
  actuationSource?: ActuationSource
  /** Offline sweeps and overrides must not touch lastSeenAt/lastReadingAt. */
  touchLastSeen?: boolean
  touchLastReading?: boolean
}

export type ApplyStateOutcome = {
  zone: Zone
  previousState: ZoneState
  newState: ZoneState
  stateChanged: boolean
  transitionId: string | null
  incidentId: string | null
  incidentOpened: boolean
  incidentResolved: boolean
  commands: ActuationCommand[]
}

function currentActuatorState(zone: Zone): ActuatorState {
  return {
    led: zone.ledColor,
    buzzer: zone.buzzerActive,
    relayCutoff: zone.relayCutoffActive,
  }
}

/**
 * Applies a computed verdict to a zone — steps 10–13 of the ingestion pipeline.
 *
 * MUST be called inside a transaction. The reading row, the state transition,
 * the incident and its timeline, and the actuation commands are one atomic
 * unit: a crash can never leave a reading stored without its transition, or an
 * incident open without its `CREATED` event.
 *
 * Broadcasting happens *after* the transaction commits — see ingestion.service.
 */
export async function applyZoneState(
  tx: PrismaTx,
  input: ApplyStateInput
): Promise<ApplyStateOutcome> {
  const { zone, at } = input
  const previousState = zone.state
  const stateChanged = previousState !== input.newState

  const outcome: ApplyStateOutcome = {
    zone,
    previousState,
    newState: input.newState,
    stateChanged,
    transitionId: null,
    incidentId: null,
    incidentOpened: false,
    incidentResolved: false,
    commands: [],
  }

  // --- Zone projection ------------------------------------------------------
  const zoneUpdate: Prisma.ZoneUpdateInput = {
    state: input.newState,
    currentRiskScore: input.riskScore,
    contributions: input.contributions as unknown as Prisma.InputJsonValue,
    reasons: input.reasons as unknown as Prisma.InputJsonValue,
    ...(input.touchLastSeen === false ? {} : { lastSeenAt: at }),
    ...(input.touchLastReading ? { lastReadingAt: at } : {}),
  }

  // --- State transition (only on an actual change) --------------------------
  if (stateChanged) {
    const transition = await tx.zoneStateTransition.create({
      data: {
        zoneId: zone.id,
        previousState,
        newState: input.newState,
        riskScore: input.riskScore,
        reason: input.reason,
        createdAt: at,
      },
    })
    outcome.transitionId = transition.id
  }

  // --- Incident lifecycle ---------------------------------------------------
  const activeIncident = await findActiveIncident(zone.id, tx)
  outcome.incidentId = activeIncident?.id ?? null

  if (input.newState === ZONE_STATE.CRITICAL) {
    recoveryTracker.push(zone.id, input.riskScore)

    if (!activeIncident && !zone.maintenanceMode) {
      const incident = await openIncident(tx, {
        zoneId: zone.id,
        riskScore: input.riskScore,
        dominantHazards: input.dominantHazards,
        startedAt: at,
        reasons: input.reasons,
      })
      outcome.incidentId = incident?.id ?? null
      outcome.incidentOpened = incident !== null
    } else if (activeIncident) {
      await refreshIncident(tx, activeIncident.id, {
        riskScore: input.riskScore,
        previousRiskScore: activeIncident.currentRiskScore,
        maximumRiskScore: Math.max(
          activeIncident.maximumRiskScore,
          input.riskScore
        ),
        dominantHazards: input.dominantHazards,
        at,
      })
    }
  } else if (input.newState === ZONE_STATE.OFFLINE) {
    // Going offline never resolves an incident: losing contact is not recovery.
    if (activeIncident) {
      await appendTimelineEvent(
        {
          incidentId: activeIncident.id,
          eventType: INCIDENT_TIMELINE_EVENT_TYPE.ZONE_OFFLINE,
          message: `Zone stopped reporting while this incident was ${activeIncident.status.toLowerCase()}. The incident remains open.`,
          metadata: { lastSeenAt: zone.lastSeenAt?.toISOString() ?? null },
          createdAt: at,
        },
        tx
      )
    }
  } else if (activeIncident) {
    const recovered = recoveryTracker.push(zone.id, input.riskScore)

    await refreshIncident(tx, activeIncident.id, {
      riskScore: input.riskScore,
      previousRiskScore: activeIncident.currentRiskScore,
      maximumRiskScore: activeIncident.maximumRiskScore,
      dominantHazards: input.dominantHazards,
      at,
    })

    if (recovered) {
      await resolveIncident(activeIncident.id, at, tx)
      await appendTimelineEvent(
        {
          incidentId: activeIncident.id,
          eventType: INCIDENT_TIMELINE_EVENT_TYPE.RESOLVED,
          message: `Hazard cleared — risk stayed below the recovery threshold for ${recoveryTracker.count(zone.id) || "the required"} consecutive readings.`,
          metadata: { riskScore: input.riskScore, state: input.newState },
          createdAt: at,
        },
        tx
      )
      recoveryTracker.reset(zone.id)
      outcome.incidentResolved = true
    }
  } else {
    recoveryTracker.push(zone.id, input.riskScore)
  }

  // --- Actuation (idempotent: commands only on a real change) ---------------
  if (!zone.maintenanceMode) {
    const current = currentActuatorState(zone)
    const desired = resolveDesiredActuation(input.newState, current)
    const deltas = diffActuation(current, desired)

    for (const delta of deltas) {
      const command = await createCommand(
        {
          zoneId: zone.id,
          incidentId: outcome.incidentId,
          type: delta.type,
          payload: delta.payload,
          source: input.actuationSource ?? ACTUATION_SOURCE.SENSOR_TRIGGERED,
          requestedAt: at,
        },
        tx
      )
      outcome.commands.push(command)
    }

    if (deltas.length > 0) {
      zoneUpdate.ledColor = desired.led
      zoneUpdate.buzzerActive = desired.buzzer
      zoneUpdate.relayCutoffActive = desired.relayCutoff
      zoneUpdate.actuatorsUpdatedAt = at

      if (outcome.incidentId) {
        await appendTimelineEvent(
          {
            incidentId: outcome.incidentId,
            eventType: INCIDENT_TIMELINE_EVENT_TYPE.ACTUATION_ISSUED,
            message: `Actuation issued: ${deltas.map((delta) => delta.type).join(", ")}`,
            metadata: { commands: deltas.map((delta) => delta.type) },
            createdAt: at,
          },
          tx
        )
      }
    }
  }

  // --- Timeline: state change on an already-open incident -------------------
  if (stateChanged && outcome.incidentId && !outcome.incidentOpened) {
    await appendTimelineEvent(
      {
        incidentId: outcome.incidentId,
        eventType: INCIDENT_TIMELINE_EVENT_TYPE.STATE_CHANGED,
        message: `Zone moved ${previousState} → ${input.newState} (risk ${input.riskScore})`,
        metadata: {
          previousState,
          newState: input.newState,
          riskScore: input.riskScore,
        },
        createdAt: at,
      },
      tx
    )
  }

  outcome.zone = await tx.zone.update({
    where: { id: zone.id },
    data: zoneUpdate,
  })

  return outcome
}

/**
 * Opens an incident, treating a unique-violation as "someone else already did".
 *
 * The partial unique index is the guarantee; this catch is what turns a race
 * into a no-op instead of a 500.
 */
async function openIncident(
  tx: PrismaTx,
  input: {
    zoneId: string
    riskScore: number
    dominantHazards: HazardType[]
    startedAt: Date
    reasons: string[]
  }
) {
  try {
    const incident = await createIncident(
      {
        zoneId: input.zoneId,
        riskScore: input.riskScore,
        dominantHazards: input.dominantHazards,
        startedAt: input.startedAt,
      },
      tx
    )

    await appendTimelineEvent(
      {
        incidentId: incident.id,
        eventType: INCIDENT_TIMELINE_EVENT_TYPE.CREATED,
        message: `Incident opened — zone entered CRITICAL at risk ${input.riskScore}`,
        metadata: {
          riskScore: input.riskScore,
          dominantHazards: input.dominantHazards,
          reasons: input.reasons,
        },
        createdAt: input.startedAt,
      },
      tx
    )

    return incident
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return null
    }
    throw error
  }
}

/** Timeline entries below this delta are noise, not narrative. */
const RISK_UPDATE_TIMELINE_DELTA = 1

async function refreshIncident(
  tx: PrismaTx,
  incidentId: string,
  input: {
    riskScore: number
    previousRiskScore: number
    maximumRiskScore: number
    dominantHazards: HazardType[]
    at: Date
  }
): Promise<void> {
  await updateIncident(
    incidentId,
    {
      currentRiskScore: input.riskScore,
      // Monotonic high-water mark — never decreases.
      maximumRiskScore: input.maximumRiskScore,
      dominantHazards: input.dominantHazards,
    },
    tx
  )

  // At 5 Hz an unconditional entry would add 300 rows a minute to a timeline a
  // human has to read, so only material movements are recorded.
  const movedMaterially =
    Math.abs(input.riskScore - input.previousRiskScore) >=
    RISK_UPDATE_TIMELINE_DELTA

  if (!movedMaterially) return

  await appendTimelineEvent(
    {
      incidentId,
      eventType: INCIDENT_TIMELINE_EVENT_TYPE.RISK_UPDATED,
      message: `Risk moved ${input.previousRiskScore} → ${input.riskScore}`,
      metadata: {
        riskScore: input.riskScore,
        previousRiskScore: input.previousRiskScore,
      },
      createdAt: input.at,
    },
    tx
  )
}
