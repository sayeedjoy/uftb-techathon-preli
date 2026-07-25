import type {
  IncidentTimelineEventDto,
  IncidentTimelineEventType,
} from "@scsrg/shared"

import { cn } from "@/lib/utils"

const EVENT_TONE = {
  CREATED: "border-critical-border",
  RISK_UPDATED: "border-border",
  STATE_CHANGED: "border-warning-border",
  ACKNOWLEDGED: "border-info-border",
  ACTUATION_ISSUED: "border-violet-500/60",
  OVERRIDE_APPLIED: "border-violet-500/60",
  ZONE_OFFLINE: "border-offline-border",
  RESOLVED: "border-safe-border",
} as const satisfies Record<IncidentTimelineEventType, string>

/** The full ordered narrative, so history can reconstruct what happened. */
export function IncidentTimeline({
  events,
}: {
  events: IncidentTimelineEventDto[]
}) {
  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No timeline events recorded.
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-2">
      {events.map((event) => (
        <li
          key={event.id}
          className={cn("border-l-2 pl-3", EVENT_TONE[event.eventType])}
        >
          <p className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {new Date(event.createdAt).toLocaleTimeString([], { hour12: false })}
            </span>
            <span className="font-medium tracking-wide uppercase">
              {event.eventType.replace(/_/g, " ").toLowerCase()}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{event.message}</p>
        </li>
      ))}
    </ol>
  )
}
