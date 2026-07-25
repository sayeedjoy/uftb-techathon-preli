import { Loader2, Siren } from "lucide-react"
import type { PriorityQueueEntryDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"

/**
 * The banner shown whenever at least one unacknowledged critical incident
 * exists.
 *
 * Icon + heavy border + explicit text, not colour alone: this has to read as an
 * emergency on a projector, in greyscale, at the back of a room. The breathing
 * icon is the only animation on the page, and `prefers-reduced-motion` stops it
 * without removing any of the other three signals.
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
      className="ring-alert flex flex-wrap items-center gap-3 rounded-lg border-2 border-critical-border bg-critical-surface px-4 py-3"
    >
      <Siren
        aria-hidden
        className="animate-alert size-6 shrink-0 text-critical"
      />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-critical">
          <span>CRITICAL · {entry.zoneName}</span>
          {unacknowledgedCount > 1 && (
            <span className="rounded border border-critical-border px-1.5 py-0.5 text-[11px] font-medium">
              +{unacknowledgedCount - 1} more unacknowledged
            </span>
          )}
        </p>
        <p className="text-xs text-critical/80">
          Risk {entry.riskScore.toFixed(1)} · priority{" "}
          {entry.priorityScore.toFixed(1)} · leading hazard{" "}
          {entry.mainHazard?.toLowerCase() ?? "unclassified"} ·{" "}
          {entry.occupancy === "UNKNOWN"
            ? "occupancy unknown (assumed occupied)"
            : entry.occupancy.toLowerCase()}
        </p>
        {entry.reasons[0] && (
          <p className="mt-0.5 text-[11px] text-critical/70">
            {entry.reasons[0]}
          </p>
        )}
      </div>

      <Button
        onClick={() => onAcknowledge(entry.incidentId)}
        disabled={isAcknowledging}
        className="shrink-0 bg-critical-solid text-critical-on-solid hover:bg-critical-solid/90"
      >
        {isAcknowledging && (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        )}
        Acknowledge
      </Button>
    </div>
  )
}
