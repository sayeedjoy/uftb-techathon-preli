import { useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  DashboardSummaryDto,
  IncidentSummaryDto,
  PriorityQueueEntryDto,
  ZoneSummaryDto,
} from "@scsrg/shared"

import { apiGet } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { useSocketEvent } from "@/hooks/use-socket"

export function useZones() {
  return useQuery({
    queryKey: queryKeys.zones.list(),
    queryFn: () => apiGet<{ zones: ZoneSummaryDto[] }>("/zones"),
    select: (data) => data.zones,
  })
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: () => apiGet<DashboardSummaryDto>("/dashboard/summary"),
  })
}

export function usePriorityQueue() {
  return useQuery({
    queryKey: queryKeys.priorityQueue.all(),
    queryFn: () => apiGet<{ queue: PriorityQueueEntryDto[] }>("/priority-queue"),
    select: (data) => data.queue,
  })
}

export function useActiveIncidents() {
  return useQuery({
    queryKey: queryKeys.incidents.active(),
    queryFn: () =>
      apiGet<{ incidents: IncidentSummaryDto[] }>("/incidents", {
        active: true,
        pageSize: 50,
      }),
    select: (data) => data.incidents,
  })
}

/**
 * Applies live events to the TanStack Query cache.
 *
 * Socket data **patches or invalidates** the cache — it is never a parallel
 * store the UI reads instead. That is what makes a reconnect converge: the API
 * remains the source of truth and the socket only accelerates it.
 */
export function useLiveDashboardSync(): void {
  const queryClient = useQueryClient()

  const patchZone = (zone: ZoneSummaryDto) => {
    queryClient.setQueryData<{ zones: ZoneSummaryDto[] }>(
      queryKeys.zones.list(),
      (previous) => {
        if (!previous) return previous
        const index = previous.zones.findIndex((entry) => entry.id === zone.id)
        if (index === -1) return { zones: [...previous.zones, zone] }
        const zones = [...previous.zones]
        zones[index] = zone
        return { zones }
      }
    )
    queryClient.setQueryData(queryKeys.zones.detail(zone.id), { zone })
  }

  useSocketEvent("zone:updated", (payload) => patchZone(payload.zone))
  useSocketEvent("zone:state-changed", (payload) => {
    patchZone(payload.zone)
    void queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.summary(),
    })
  })

  useSocketEvent("priority:updated", (payload) => {
    queryClient.setQueryData(queryKeys.priorityQueue.all(), {
      queue: payload.queue,
    })
  })

  const invalidateIncidents = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all() })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.summary(),
    })
  }

  useSocketEvent("incident:created", invalidateIncidents)
  useSocketEvent("incident:updated", invalidateIncidents)
  useSocketEvent("incident:acknowledged", invalidateIncidents)
  useSocketEvent("incident:resolved", invalidateIncidents)

  useSocketEvent("sensor:offline", () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.zones.list() })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.dashboard.summary(),
    })
  })
}
