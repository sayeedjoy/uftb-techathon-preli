import { Siren } from "lucide-react"
import type { PriorityQueueEntryDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"

/**
 * The banner shown whenever at least one unacknowledged critical incident
 * exists.
 *
 * Icon + heavy border + explicit text, not colour alone: this has to read as an
 * emergency on a projector, in greyscale, at the back of a room.
 */
export function CriticalBanner({
  entry,
  unacknowledgedCount,
  onAcknowledge,
  isAcknowledging,
}: {
  entry: PriorityQueueEntryDto
  unacknowledgedCount: number
  onAcknowledge: (incidentId: string) => void
  isAcknowledging: boolean
}) {
  return (
    <div
      role="alert"
      data-testid="critical-banner"
      className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-red-500/70 bg-red-950/50 px-4 py-3"
    >
      <Siren aria-hidden className="size-6 shrink-0 animate-pulse text-red-400" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-200">
          CRITICAL · {entry.zoneName}
          {unacknowledgedCount > 1 && (
            <span className="ml-2 rounded border border-red-400/50 px-1.5 py-0.5 text-[11px] font-medium">
              +{unacknowledgedCount - 1} more unacknowledged
            </span>
          )}
        </p>
        <p className="text-xs text-red-200/80">
          Risk {entry.riskScore.toFixed(1)} · priority{" "}
          {entry.priorityScore.toFixed(1)} · leading hazard{" "}
          {entry.mainHazard?.toLowerCase() ?? "unclassified"} ·{" "}
          {entry.occupancy === "UNKNOWN"
            ? "occupancy unknown (assumed occupied)"
            : entry.occupancy.toLowerCase()}
        </p>
        {entry.reasons[0] && (
          <p className="mt-0.5 text-[11px] text-red-200/70">{entry.reasons[0]}</p>
        )}
      </div>

      <Button
        onClick={() => onAcknowledge(entry.incidentId)}
        disabled={isAcknowledging}
        className="shrink-0"
      >
        Acknowledge
      </Button>
    </div>
  )
}
