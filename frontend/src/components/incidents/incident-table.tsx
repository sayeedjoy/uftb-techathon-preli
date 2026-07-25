import type { IncidentSummaryDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString([], { hour12: false })
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "ongoing"
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

const STATUS_CLASS = {
  OPEN: "border-red-500/50 bg-red-950/40 text-red-300",
  ACKNOWLEDGED: "border-sky-500/50 bg-sky-950/40 text-sky-300",
  RESOLVED: "border-emerald-600/40 bg-emerald-950/30 text-emerald-300",
} as const satisfies Record<IncidentSummaryDto["status"], string>

export function IncidentTable({
  incidents,
  isLoading,
  error,
  onSelect,
}: {
  incidents: IncidentSummaryDto[]
  isLoading: boolean
  error: unknown
  onSelect: (incidentId: string) => void
}) {
  if (isLoading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Loading incidents…
      </Card>
    )
  }

  if (error != null) {
    return (
      <Card role="alert" className="border-red-500/50 p-6 text-sm text-red-300">
        Could not load incidents.
      </Card>
    )
  }

  if (incidents.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No incidents match these filters.
      </Card>
    )
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[64rem] text-sm">
        <thead className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Incident</th>
            <th className="px-3 py-2 font-medium">Zone</th>
            <th className="px-3 py-2 font-medium">Main hazard</th>
            <th className="px-3 py-2 text-right font-medium">Max risk</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2 font-medium">Acknowledged</th>
            <th className="px-3 py-2 font-medium">Resolved</th>
            <th className="px-3 py-2 font-medium">Duration</th>
            <th className="px-3 py-2 font-medium">By</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {incidents.map((incident) => (
            <tr
              key={incident.id}
              tabIndex={0}
              role="button"
              onClick={() => onSelect(incident.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect(incident.id)
                }
              }}
              className="cursor-pointer hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
            >
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {incident.id.slice(0, 8)}
              </td>
              <td className="px-3 py-2">{incident.zoneName}</td>
              <td className="px-3 py-2">
                {incident.mainHazard?.toLowerCase() ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {incident.maximumRiskScore.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-xs">
                {formatTimestamp(incident.startedAt)}
              </td>
              <td className="px-3 py-2 text-xs">
                {formatTimestamp(incident.acknowledgedAt)}
              </td>
              <td className="px-3 py-2 text-xs">
                {formatTimestamp(incident.resolvedAt)}
              </td>
              <td className="px-3 py-2 text-xs">
                {formatDuration(incident.durationSeconds)}
              </td>
              <td className="px-3 py-2 text-xs">
                {incident.acknowledgedByName ?? "—"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase",
                    STATUS_CLASS[incident.status]
                  )}
                >
                  {incident.status.toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
