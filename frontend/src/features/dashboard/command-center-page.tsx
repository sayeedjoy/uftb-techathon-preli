import * as React from "react"
import type { ZoneSummaryDto } from "@scsrg/shared"

import { CriticalBanner } from "@/components/alerts/critical-banner"
import { LiveEventFeed } from "@/components/alerts/live-event-feed"
import { SummaryBar } from "@/components/layout/summary-bar"
import { PriorityQueuePanel } from "@/components/priority/priority-queue"
import { ZoneCard } from "@/components/zones/zone-card"
import { STATE_SORT_ORDER } from "@/components/zones/zone-presentation"
import { Card } from "@/components/ui/card"
import { useAlertStream } from "@/hooks/use-alert-stream"
import { useAcknowledgeIncident } from "@/features/incidents/use-acknowledge"
import {
  useDashboardSummary,
  useLiveDashboardSync,
  usePriorityQueue,
  useZones,
} from "./use-dashboard-data"

function sortZones(zones: ZoneSummaryDto[]): ZoneSummaryDto[] {
  // CRITICAL first, then WARNING, OFFLINE, SAFE — most urgent nearest the top.
  return [...zones].sort((a, b) => {
    const byState = STATE_SORT_ORDER[a.state] - STATE_SORT_ORDER[b.state]
    if (byState !== 0) return byState
    if (b.currentRiskScore !== a.currentRiskScore) {
      return b.currentRiskScore - a.currentRiskScore
    }
    return a.name.localeCompare(b.name)
  })
}

export function CommandCenterPage() {
  useLiveDashboardSync()
  useAlertStream()

  const zones = useZones()
  const summary = useDashboardSummary()
  const queue = usePriorityQueue()
  const acknowledge = useAcknowledgeIncident()

  const [acknowledgingId, setAcknowledgingId] = React.useState<string | null>(
    null
  )

  const onAcknowledge = React.useCallback(
    (incidentId: string) => {
      setAcknowledgingId(incidentId)
      acknowledge.mutate(
        { incidentId },
        { onSettled: () => setAcknowledgingId(null) }
      )
    },
    [acknowledge]
  )

  const unacknowledged = (queue.data ?? []).filter(
    (entry) => !entry.acknowledged
  )
  const topAlert = unacknowledged[0]

  return (
    <div className="flex flex-col gap-4">
      <SummaryBar summary={summary.data} isLoading={summary.isLoading} />

      {topAlert && (
        <CriticalBanner
          entry={topAlert}
          unacknowledgedCount={unacknowledged.length}
          onAcknowledge={onAcknowledge}
          isAcknowledging={acknowledgingId === topAlert.incidentId}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Zone grid" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Campus zones
          </h2>

          {zones.isLoading && (
            <Card className="p-6 text-sm text-muted-foreground">
              Loading zones…
            </Card>
          )}

          {!zones.isLoading && zones.error != null && (
            <Card
              role="alert"
              className="border-red-500/50 p-6 text-sm text-red-300"
            >
              Could not load zones. The dashboard is showing no data rather than
              stale data.
            </Card>
          )}

          {!zones.isLoading && !zones.error && (zones.data?.length ?? 0) === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">
              No zones are configured yet. An administrator can add one from the
              Administration page.
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {sortZones(zones.data ?? []).map((zone) => (
              <ZoneCard key={zone.id} zone={zone} />
            ))}
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <PriorityQueuePanel
            queue={queue.data}
            isLoading={queue.isLoading}
            error={queue.error}
            onAcknowledge={onAcknowledge}
            acknowledgingId={acknowledgingId}
          />
          <LiveEventFeed />
        </div>
      </div>
    </div>
  )
}
