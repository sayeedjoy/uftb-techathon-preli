import type { Zone } from "@prisma/client"
import {
  ACTUATION_SOURCE,
  ACTUATION_TYPE,
  INCIDENT_TIMELINE_EVENT_TYPE,
  OVERRIDE_ACTION,
  SENSOR_STATUS,
  SYSTEM_EVENT_SEVERITY,
  SYSTEM_EVENT_TYPE,
  type ManualOverrideDto,
  type OverrideInput,
} from "@scsrg/shared"

import { withTransaction, type PrismaTx } from "../../database/transaction.js"
import { NotFoundError, ValidationError } from "../../shared/errors.js"
import { createCommand } from "../actuation/actuation.repository.js"
import { writeAuditLog } from "../audit/audit.service.js"
import { findActiveIncident } from "../incidents/incident.repository.js"
import { appendTimelineEvent } from "../incidents/timeline.repository.js"
import { recordSystemEvent } from "../system-health/system-event.repository.js"
import { findZoneByIdOrCode } from "../zones/zones.repository.js"
import { publishZoneUpdate } from "../../realtime/domain-events.js"

export type ApplyOverrideInput = OverrideInput & {
  zoneIdentifier: string
  userId: string
  userName: string
  ipAddress?: string | null
}

/**
 * Applies an admin override.
 *
 * Every override is reasoned, audited, and routed through the same actuation
 * command model as a sensor-triggered response — but tagged
 * `source: MANUAL_OVERRIDE`, so the UI can always tell a human decision from an
 * automatic one. Nothing here bypasses the idempotent resolver.
 */
export async function applyOverride(
  input: ApplyOverrideInput
): Promise<ManualOverrideDto> {
  const zone = await findZoneByIdOrCode(input.zoneIdentifier)
  if (!zone) throw new NotFoundError("Zone not found.")

  const result = await withTransaction(async (tx) => {
    const now = new Date()
    const activeIncident = await findActiveIncident(zone.id, tx)

    switch (input.action) {
      case OVERRIDE_ACTION.FORCE_MAINTENANCE_MODE:
        await tx.zone.update({
          where: { id: zone.id },
          data: { maintenanceMode: true },
        })
        break

      case OVERRIDE_ACTION.CLEAR_MAINTENANCE_MODE:
        await tx.zone.update({
          where: { id: zone.id },
          data: { maintenanceMode: false },
        })
        break

      case OVERRIDE_ACTION.SILENCE_BUZZER:
        if (zone.buzzerActive) {
          await createCommand(
            {
              zoneId: zone.id,
              incidentId: activeIncident?.id ?? null,
              type: ACTUATION_TYPE.DEACTIVATE_BUZZER,
              payload: { active: false, silencedBy: input.userName },
              source: ACTUATION_SOURCE.MANUAL_OVERRIDE,
              requestedAt: now,
            },
            tx
          )
          await tx.zone.update({
            where: { id: zone.id },
            data: { buzzerActive: false, actuatorsUpdatedAt: now },
          })
        }
        break

      case OVERRIDE_ACTION.TEST_ACTUATION:
        await createCommand(
          {
            zoneId: zone.id,
            type: ACTUATION_TYPE.SET_LED,
            payload: { color: zone.ledColor, test: true },
            source: ACTUATION_SOURCE.MANUAL_OVERRIDE,
            requestedAt: now,
          },
          tx
        )
        break

      case OVERRIDE_ACTION.RESET_ACTUATION:
        await resetActuation(tx, zone, now, input.userName)
        break

      case OVERRIDE_ACTION.MARK_SENSOR_MAINTENANCE:
      case OVERRIDE_ACTION.CLEAR_SENSOR_MAINTENANCE: {
        if (!input.sensorId) {
          throw new ValidationError(
            "A sensorId is required for a sensor maintenance override."
          )
        }
        const sensor = await tx.sensor.findFirst({
          where: { id: input.sensorId, zoneId: zone.id },
        })
        if (!sensor) throw new NotFoundError("Sensor not found for this zone.")

        await tx.sensor.update({
          where: { id: sensor.id },
          data: {
            status:
              input.action === OVERRIDE_ACTION.MARK_SENSOR_MAINTENANCE
                ? SENSOR_STATUS.MAINTENANCE
                : SENSOR_STATUS.OFFLINE,
          },
        })
        break
      }
    }

    const override = await tx.manualOverride.create({
      data: {
        zoneId: zone.id,
        userId: input.userId,
        action: input.action,
        reason: input.reason,
        metadata: {
          ...(input.metadata ?? {}),
          ...(input.sensorId ? { sensorId: input.sensorId } : {}),
        },
      },
      include: { user: { select: { name: true } }, zone: { select: { code: true } } },
    })

    await writeAuditLog(
      {
        userId: input.userId,
        action: `OVERRIDE_${input.action}`,
        entityType: "Zone",
        entityId: zone.id,
        metadata: {
          action: input.action,
          reason: input.reason,
          zoneCode: zone.code,
          ...(input.sensorId ? { sensorId: input.sensorId } : {}),
        },
        ipAddress: input.ipAddress ?? null,
      },
      tx
    )

    if (activeIncident) {
      await appendTimelineEvent(
        {
          incidentId: activeIncident.id,
          eventType: INCIDENT_TIMELINE_EVENT_TYPE.OVERRIDE_APPLIED,
          message: `${input.userName} applied override ${input.action}: ${input.reason}`,
          metadata: { action: input.action, userId: input.userId },
          createdAt: now,
        },
        tx
      )
    }

    return override
  })

  await recordSystemEvent({
    type: SYSTEM_EVENT_TYPE.MAINTENANCE_MODE,
    severity: SYSTEM_EVENT_SEVERITY.INFO,
    message: `Override ${input.action} applied to ${zone.code} by ${input.userName}`,
    zoneId: zone.id,
    metadata: { reason: input.reason },
  })

  await publishZoneUpdate(zone.id)

  return {
    id: result.id,
    zoneId: result.zoneId,
    zoneCode: result.zone.code,
    userId: result.userId,
    userName: result.user.name,
    action: result.action,
    reason: result.reason,
    metadata:
      typeof result.metadata === "object" && result.metadata !== null
        ? (result.metadata as Record<string, unknown>)
        : {},
    createdAt: result.createdAt.toISOString(),
  }
}

/** Returns every actuator to its safe resting position after an investigation. */
async function resetActuation(
  tx: PrismaTx,
  zone: Zone,
  now: Date,
  userName: string
): Promise<void> {
  if (zone.buzzerActive) {
    await createCommand(
      {
        zoneId: zone.id,
        type: ACTUATION_TYPE.DEACTIVATE_BUZZER,
        payload: { active: false, resetBy: userName },
        source: ACTUATION_SOURCE.SYSTEM_RECOVERY,
        requestedAt: now,
      },
      tx
    )
  }
  if (zone.relayCutoffActive) {
    await createCommand(
      {
        zoneId: zone.id,
        type: ACTUATION_TYPE.DEACTIVATE_RELAY,
        payload: { active: false, resetBy: userName },
        source: ACTUATION_SOURCE.SYSTEM_RECOVERY,
        requestedAt: now,
      },
      tx
    )
  }

  await tx.zone.update({
    where: { id: zone.id },
    data: {
      buzzerActive: false,
      relayCutoffActive: false,
      actuatorsUpdatedAt: now,
    },
  })
}
