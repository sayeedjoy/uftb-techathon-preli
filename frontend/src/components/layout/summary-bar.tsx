import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  HelpCircle,
  Radio,
  Siren,
} from "lucide-react"
import type { DashboardSummaryDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

function Metric({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: typeof Radio
  label: string
  value: number | string
  tone?: "danger" | "warning" | "ok" | "muted"
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          tone === "danger" && "text-red-400",
          tone === "warning" && "text-amber-400",
          tone === "ok" && "text-emerald-400",
          (!tone || tone === "muted") && "text-muted-foreground"
        )}
      />
      <div className="min-w-0">
        <p className="font-mono text-base leading-none font-semibold tabular-nums">
          {value}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  )
}

/** The always-visible operating picture across the top of the Command Center. */
export function SummaryBar({
  summary,
  isLoading,
}: {
  summary: DashboardSummaryDto | undefined
  isLoading: boolean
}) {
  if (isLoading || !summary) {
    return (
      <Card className="px-4 py-3 text-sm text-muted-foreground">
        Loading system summary…
      </Card>
    )
  }

  return (
    <Card
      data-testid="summary-bar"
      className="grid grid-cols-2 divide-x divide-y divide-border/40 p-0 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0"
    >
      <Metric
        Icon={Radio}
        label="Zones reporting"
        value={`${summary.connectedZones}/${summary.totalZones}`}
        tone={summary.connectedZones === summary.totalZones ? "ok" : "warning"}
      />
      <Metric
        Icon={CheckCircle2}
        label="Safe"
        value={summary.stateCounts.SAFE}
        tone="ok"
      />
      <Metric
        Icon={AlertTriangle}
        label="Warning"
        value={summary.stateCounts.WARNING}
        tone={summary.stateCounts.WARNING > 0 ? "warning" : "muted"}
      />
      <Metric
        Icon={Siren}
        label="Critical"
        value={summary.stateCounts.CRITICAL}
        tone={summary.stateCounts.CRITICAL > 0 ? "danger" : "muted"}
      />
      <Metric
        Icon={HelpCircle}
        label="Offline"
        value={summary.offlineZones}
        tone={summary.offlineZones > 0 ? "warning" : "muted"}
      />
      <Metric
        Icon={BellRing}
        label="Unacknowledged"
        value={summary.unacknowledgedIncidents}
        tone={summary.unacknowledgedIncidents > 0 ? "danger" : "muted"}
      />
    </Card>
  )
}
