import * as React from "react"
import {
  Activity,
  AlertOctagon,
  CheckCircle2,
  CircleDot,
  Pause,
  Play,
  Power,
  Siren,
  WifiOff,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { useSocketEvent } from "@/hooks/use-socket"

const MAX_ENTRIES = 100

type Severity = "info" | "warn" | "critical" | "ok"

export type FeedEntry = {
  id: string
  at: string
  zone: string
  message: string
  severity: Severity
}

const SEVERITY_PRESENTATION = {
  info: { Icon: CircleDot, className: "text-muted-foreground" },
  ok: { Icon: CheckCircle2, className: "text-safe" },
  warn: { Icon: AlertOctagon, className: "text-warning" },
  critical: { Icon: Siren, className: "text-critical" },
} as const satisfies Record<
  Severity,
  { Icon: typeof CircleDot; className: string }
>

/**
 * The scrolling narrative that makes a demo legible.
 *
 * Bounded to the most recent N entries so a long run cannot grow it without
 * limit, de-duplicated by `eventId` upstream, and pausable so an operator can
 * actually read a line before it scrolls away.
 */
export function LiveEventFeed() {
  const [entries, setEntries] = React.useState<FeedEntry[]>([])
  const [paused, setPaused] = React.useState(false)
  const pausedRef = React.useRef(paused)
  React.useLayoutEffect(() => {
    pausedRef.current = paused
  }, [paused])

  const append = React.useCallback((entry: FeedEntry) => {
    if (pausedRef.current) return
    setEntries((previous) => {
      if (previous.some((existing) => existing.id === entry.id)) return previous
      return [entry, ...previous].slice(0, MAX_ENTRIES)
    })
  }, [])

  useSocketEvent("reading:accepted", (payload) => {
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.zoneCode,
      message:
        payload.result.validationStatus === "ACCEPTED_OUT_OF_ORDER"
          ? `Out-of-order reading stored (not applied) · risk ${payload.reading.riskScore.toFixed(1)}`
          : `Reading accepted · risk ${payload.reading.riskScore.toFixed(1)}`,
      severity: "info",
    })
  })

  useSocketEvent("zone:state-changed", (payload) => {
    const state = payload.transition.newState
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.zone.code,
      message: `Zone entered ${state} (${payload.transition.previousState ?? "—"} → ${state})`,
      severity:
        state === "CRITICAL"
          ? "critical"
          : state === "WARNING" || state === "OFFLINE"
            ? "warn"
            : "ok",
    })
  })

  useSocketEvent("incident:created", (payload) => {
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.incident.zoneCode,
      message: `Incident created · peak risk ${payload.incident.maximumRiskScore.toFixed(1)}`,
      severity: "critical",
    })
  })

  useSocketEvent("incident:acknowledged", (payload) => {
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.incident.zoneCode,
      message: `Incident acknowledged${
        payload.incident.acknowledgedByName
          ? ` by ${payload.incident.acknowledgedByName}`
          : ""
      }`,
      severity: "warn",
    })
  })

  useSocketEvent("incident:resolved", (payload) => {
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.incident.zoneCode,
      message: "Incident resolved",
      severity: "ok",
    })
  })

  useSocketEvent("sensor:offline", (payload) => {
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.zoneCode,
      message: "Zone went offline — not safe, unknown",
      severity: "warn",
    })
  })

  useSocketEvent("actuation:command", (payload) => {
    append({
      id: payload.eventId,
      at: payload.emittedAt,
      zone: payload.command.zoneId.slice(0, 8),
      message: `${payload.command.type.replace(/_/g, " ").toLowerCase()} (${payload.command.source.replace(/_/g, " ").toLowerCase()})`,
      severity: payload.command.type === "ACTIVATE_RELAY" ? "warn" : "info",
    })
  })

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <Activity aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Live event feed</h2>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {paused ? (
            <>
              <Play aria-hidden className="size-3" /> Resume
            </>
          ) : (
            <>
              <Pause aria-hidden className="size-3" /> Pause
            </>
          )}
        </button>
      </header>

      <ul
        data-testid="event-feed"
        className="max-h-[28rem] divide-y divide-border/30 overflow-y-auto"
      >
        {entries.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground">
            Waiting for events… start the simulator to see the system work.
          </li>
        )}
        {entries.map((entry) => {
          const { Icon, className } = SEVERITY_PRESENTATION[entry.severity]
          return (
            <li
              key={entry.id}
              className="flex items-start gap-2 px-4 py-2 text-xs"
            >
              <Icon
                aria-hidden
                className={cn("mt-0.5 size-3.5 shrink-0", className)}
              />
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {entry.zone}
              </span>
              <span className="min-w-0 flex-1">{entry.message}</span>
            </li>
          )
        })}
      </ul>

      {paused && (
        <p className="border-t border-border/60 bg-warning-surface px-4 py-2 text-[11px] text-warning">
          <Power aria-hidden className="mr-1 inline size-3" />
          Feed paused — new events are not being collected.
        </p>
      )}
      {entries.length >= MAX_ENTRIES && !paused && (
        <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <WifiOff aria-hidden className="mr-1 inline size-3" />
          Showing the most recent {MAX_ENTRIES} events.
        </p>
      )}
    </Card>
  )
}
