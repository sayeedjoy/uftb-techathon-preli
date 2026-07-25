import type { ZoneState } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { ZONE_STATE_PRESENTATION } from "./zone-presentation"

/**
 * The risk score as a bar against its thresholds.
 *
 * A number alone makes an operator do arithmetic — "is 61 close to critical?"
 * The bar answers that pre-attentively, and the threshold ticks say where the
 * lines are. The fill is coloured by the *backend's* classification, never by
 * the client re-deriving state from the score: if those two ever disagreed,
 * the backend is right and the discrepancy should be visible, not papered over.
 */
export function RiskMeter({
  score,
  state,
  warningAt = 30,
  criticalAt = 65,
  className,
}: {
  score: number
  state: ZoneState
  warningAt?: number
  criticalAt?: number
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, score))
  const { meter } = ZONE_STATE_PRESENTATION[state]

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Risk score ${clamped.toFixed(1)} of 100`}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          meter,
          // An offline zone has no trustworthy score; showing a confident bar
          // would assert something the system does not know.
          state === "OFFLINE" && "opacity-40"
        )}
        style={{ width: `${clamped}%` }}
      />

      {[warningAt, criticalAt].map((threshold) => (
        <span
          key={threshold}
          aria-hidden
          className="absolute inset-y-0 w-px bg-background/70"
          style={{ left: `${threshold}%` }}
        />
      ))}
    </div>
  )
}
