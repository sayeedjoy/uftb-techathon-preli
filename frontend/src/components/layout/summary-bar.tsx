import { BellRing, Flame, HelpCircle, ListOrdered, Radio } from "lucide-react"
import type { DashboardSummaryDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type Tone = "danger" | "warning" | "ok" | "muted"

const TONE_CLASS: Record<Tone, { icon: string; value: string }> = {
  danger: { icon: "text-critical", value: "text-critical" },
  warning: { icon: "text-warning", value: "text-warning" },
  ok: { icon: "text-safe", value: "text-foreground" },
  muted: { icon: "text-muted-foreground", value: "text-foreground" },
}

/**
 * A stat tile — a headline number with its label, not a chart.
 *
 * The value carries the tone; the label stays in muted ink so a row of tiles
 * scans as one object rather than six competing colours.
 */
function Metric({
  Icon,
  label,
  value,
  hint,
  tone = "muted",
}: {
  Icon: typeof Radio
  label: string
  value: number | string
  hint?: string
  tone?: Tone
}) {
  const classes = TONE_CLASS[tone]

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5" title={hint}>
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", classes.icon)}
      />
      <div className="min-w-0">
        <p
          data-numeric
          className={cn(
            "font-mono text-lg leading-none font-semibold",
            classes.value
          )}
        >
          {value}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  )
}

function SummaryBarSkeleton() {
  return (
    <Card
      aria-busy
      aria-label="Loading system summary"
      className="grid grid-cols-2 divide-x divide-y divide-border/40 p-0 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0"
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-start gap-2.5 px-3 py-2.5">
          <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="mt-1.5 h-2.5 w-16" />
          </div>
        </div>
      ))}
    </Card>
  )
}

/**
 * The operating picture beneath the posture header.
 *
 * Deliberately *not* the per-state zone counts — those live in the posture
 * header's distribution bar, and repeating them here would spend the most
 * valuable strip on the page saying the same thing twice. These are the
 * response-side numbers instead.
 */
export function SummaryBar({
  summary,
  isLoading,
}: {
  summary: DashboardSummaryDto | undefined
  isLoading: boolean
}) {
  // A skeleton in the final layout, not a line of text: the bar keeps its
  // height, so nothing below it jumps when the first payload lands.
  if (isLoading || !summary) return <SummaryBarSkeleton />

  const allReporting = summary.connectedZones === summary.totalZones
  const top = summary.highestPriorityIncident

  return (
    <Card
      data-testid="summary-bar"
      className="grid grid-cols-2 divide-x divide-y divide-border/40 p-0 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0"
    >
      <Metric
        Icon={Radio}
        label="Zones reporting"
        value={`${summary.connectedZones}/${summary.totalZones}`}
        tone={allReporting ? "ok" : "warning"}
        hint="Zones that have sent an accepted reading within the offline timeout"
      />
      <Metric
        Icon={Flame}
        label="Active incidents"
        value={summary.activeIncidents}
        tone={summary.activeIncidents > 0 ? "warning" : "muted"}
        hint="Open or acknowledged, not yet resolved"
      />
      <Metric
        Icon={BellRing}
        label="Unacknowledged"
        value={summary.unacknowledgedIncidents}
        tone={summary.unacknowledgedIncidents > 0 ? "danger" : "muted"}
        hint="Incidents nobody has taken responsibility for yet"
      />
      <Metric
        Icon={HelpCircle}
        label="Offline"
        value={summary.offlineZones}
        tone={summary.offlineZones > 0 ? "warning" : "muted"}
        hint="Silent zones — unknown, never assumed safe"
      />
      <Metric
        Icon={ListOrdered}
        label={top ? `Top priority · ${top.zoneName}` : "Top priority"}
        value={top ? top.priorityScore.toFixed(1) : "—"}
        tone={top && !top.acknowledged ? "danger" : "muted"}
        hint="Highest-ranked incident from the backend's priority queue"
      />
    </Card>
  )
}
