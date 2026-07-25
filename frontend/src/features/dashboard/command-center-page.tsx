import * as React from "react"
import { LayoutGrid, TriangleAlert } from "lucide-react"
import type { ZoneSummaryDto } from "@scsrg/shared"

import { CriticalBanner } from "@/components/alerts/critical-banner"
import { LiveEventFeed } from "@/components/alerts/live-event-feed"
import { PostureHeader } from "@/components/layout/posture-header"
import { SummaryBar } from "@/components/layout/summary-bar"
import { PriorityQueuePanel } from "@/components/priority/priority-queue"
import { ZoneCard } from "@/components/zones/zone-card"
import { ZoneCardSkeleton } from "@/components/zones/zone-card-skeleton"
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
  const zoneCount = zones.data?.length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <PostureHeader summary={summary.data} isLoading={summary.isLoading} />

      {topAlert && (
        <CriticalBanner
          entry={topAlert}
          unacknowledgedCount={unacknowledged.length}
          onAcknowledge={onAcknowledge}
          isAcknowledging={acknowledgingId === topAlert.incidentId}
        />
      )}

      <SummaryBar summary={summary.data} isLoading={summary.isLoading} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Zone grid" className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Campus zones
            </h2>
            {!zones.isLoading && !zones.error && zoneCount > 0 && (
              <span
                data-numeric
                className="font-mono text-[11px] text-muted-foreground"
              >
                {zoneCount}
              </span>
            )}
          </div>

          {zones.isLoading && (
            <div
              aria-busy
              aria-label="Loading zones"
              className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <ZoneCardSkeleton key={index} />
              ))}
            </div>
          )}

          {!zones.isLoading && zones.error != null && (
            <Card
              role="alert"
              className="flex items-start gap-3 border-critical-border bg-critical-surface p-6"
            >
              <TriangleAlert
                aria-hidden
                className="mt-0.5 size-5 shrink-0 text-critical"
              />
              <div>
                <p className="text-sm font-medium text-critical">
                  Could not load zones
                </p>
                <p className="mt-0.5 text-sm text-critical/80">
                  The dashboard is showing no data rather than stale data.
                </p>
              </div>
            </Card>
          )}

          {!zones.isLoading && !zones.error && zoneCount === 0 && (
            <Card className="flex flex-col items-center gap-2 p-10 text-center">
              <LayoutGrid aria-hidden className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">No zones are configured yet</p>
              <p className="max-w-[40ch] text-xs text-muted-foreground">
                An administrator can add one from the Administration page. Zones
                need no code change — a row is enough.
              </p>
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
