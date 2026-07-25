import { INCIDENT_STATUS, INCIDENT_TIMELINE_EVENT_TYPE } from "@scsrg/shared"
import type { AcknowledgmentDto } from "@scsrg/shared"

import { withTransaction } from "../../database/transaction.js"
import {
  AlreadyAcknowledgedError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors.js"
import { writeAuditLog } from "../audit/audit.service.js"
import {
  acknowledgeIfOpen,
  findIncidentById,
} from "../incidents/incident.repository.js"
import { appendTimelineEvent } from "../incidents/timeline.repository.js"
import {
  publishIncidentEvent,
  publishPriorityQueue,
} from "../../realtime/domain-events.js"

export type AcknowledgeInput = {
  incidentId: string
  userId: string
  userName: string
  note?: string
  ipAddress?: string | null
}

/**
 * Acknowledges an incident. Exactly one caller can win.
 *
 * Two database-level mechanisms, belt and braces:
 *   1. a conditional `UPDATE … WHERE id = $1 AND status = 'OPEN'`, whose
 *      predicate and write are a single statement, so two concurrent requests
 *      cannot both observe OPEN; and
 *   2. `UNIQUE(incidentId)` on `Acknowledgment`, which would reject a second
 *      row even if the first guard were somehow bypassed.
 *
 * Disabling the button in the browser is a UX nicety, never the mechanism.
 */
export async function acknowledgeIncident(
  input: AcknowledgeInput
): Promise<AcknowledgmentDto> {
  const existing = await findIncidentById(input.incidentId)
  if (!existing) throw new NotFoundError("Incident not found.")

  if (existing.status === INCIDENT_STATUS.RESOLVED) {
    throw new ConflictError(
      "This incident has already been resolved and cannot be acknowledged."
    )
  }

  const acknowledgment = await withTransaction(async (tx) => {
    const acknowledgedAt = new Date()

    const updated = await acknowledgeIfOpen(
      input.incidentId,
      acknowledgedAt,
      tx
    )

    if (updated === 0) {
      // Someone else got there first; the loser must see a 409, not a 200.
      throw new AlreadyAcknowledgedError()
    }

    const row = await tx.acknowledgment.create({
      data: {
        incidentId: input.incidentId,
        userId: input.userId,
        acknowledgedAt,
        note: input.note ?? null,
      },
      include: { user: true },
    })

    await appendTimelineEvent(
      {
        incidentId: input.incidentId,
        eventType: INCIDENT_TIMELINE_EVENT_TYPE.ACKNOWLEDGED,
        message: `Acknowledged by ${input.userName}${input.note ? `: ${input.note}` : ""}`,
        metadata: { userId: input.userId, note: input.note ?? null },
        createdAt: acknowledgedAt,
      },
      tx
    )

    await writeAuditLog(
      {
        userId: input.userId,
        action: "INCIDENT_ACKNOWLEDGED",
        entityType: "Incident",
        entityId: input.incidentId,
        metadata: { note: input.note ?? null },
        ipAddress: input.ipAddress ?? null,
      },
      tx
    )

    return row
  })

  // Broadcast after commit.
  await publishIncidentEvent(input.incidentId, "incident:acknowledged")
  await publishPriorityQueue()

  return {
    id: acknowledgment.id,
    incidentId: acknowledgment.incidentId,
    userId: acknowledgment.userId,
    userName: acknowledgment.user.name,
    acknowledgedAt: acknowledgment.acknowledgedAt.toISOString(),
    note: acknowledgment.note,
  }
}
