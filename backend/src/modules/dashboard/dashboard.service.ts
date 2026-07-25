import { ZONE_STATES, type DashboardSummaryDto, type ZoneStateCounts } from "@scsrg/shared"

import { prisma } from "../../database/prisma.js"
import {
  countActiveIncidents,
  countUnacknowledgedIncidents,
} from "../incidents/incident.repository.js"
import { getPriorityQueue } from "../priority-engine/priority-queue.service.js"
import { getHealthRollup } from "../system-health/system-health.service.js"

/**
 * One request that populates the entire top summary bar.
 *
 * Counts come from `groupBy` aggregates rather than loading every zone and
 * counting in JavaScript — at 30+ zones with 10k readings that difference is
 * the whole latency budget.
 */
export async function getDashboardSummary(): Promise<DashboardSummaryDto> {
  const [grouped, totalZones, activeIncidents, unacknowledged, queue, health] =
    await Promise.all([
      prisma.zone.groupBy({
        by: ["state"],
        where: { isActive: true },
        _count: { _all: true },
      }),
      prisma.zone.count({ where: { isActive: true } }),
      countActiveIncidents(),
      countUnacknowledgedIncidents(),
      getPriorityQueue(),
      getHealthRollup(),
    ])

  const stateCounts = Object.fromEntries(
    ZONE_STATES.map((state) => [state, 0])
  ) as ZoneStateCounts

  for (const row of grouped) {
    stateCounts[row.state] = row._count._all
  }

  const offlineZones = stateCounts.OFFLINE

  return {
    serverTime: new Date().toISOString(),
    totalZones,
    connectedZones: totalZones - offlineZones,
    stateCounts,
    activeIncidents,
    unacknowledgedIncidents: unacknowledged,
    offlineZones,
    highestPriorityIncident: queue[0] ?? null,
    health,
  }
}
