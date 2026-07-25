import { Link } from "react-router"
import {
  Clock,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertOctagon,
} from "lucide-react"
import type { RiskTrend, ZoneSummaryDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { ActuatorStrip } from "./actuator-strip"
import { RiskMeter } from "./risk-meter"
import { SensorReadout } from "./sensor-readout"
import { StateBadge } from "./state-badge"
import { stateBorderClass } from "./zone-presentation"

function relativeTime(iso: string | null): string {
  if (!iso) return "never"
  const deltaMs = Date.now() - Date.parse(iso)
  if (!Number.isFinite(deltaMs)) return "unknown"
  if (deltaMs < 2_000) return "just now"
  if (deltaMs < 60_000) return `${Math.floor(deltaMs / 1000)}s ago`
  if (deltaMs < 3_600_000) return `${Math.floor(deltaMs / 60_000)}m ago`
  return `${Math.floor(deltaMs / 3_600_000)}h ago`
}

const TREND_PRESENTATION = {
  STABLE: { label: "Stable", Icon: Minus, className: "text-muted-foreground" },
  RISING: { label: "Rising", Icon: TrendingUp, className: "text-warning" },
  FALLING: { label: "Falling", Icon: TrendingDown, className: "text-safe" },
  TRENDING_CRITICAL: {
    label: "Trending critical",
    Icon: TrendingUp,
    className: "text-critical",
  },
} as const satisfies Record<
  RiskTrend,
  { label: string; Icon: typeof Minus; className: string }
>

/**
 * One zone at a glance.
 *
 * Everything an operator needs to triage in about two seconds: state, score,
 * every sensor, the simulated actuators, when it last spoke, and one line
 * saying *why* it is in this state.
 */
export function ZoneCard({ zone }: { zone: ZoneSummaryDto }) {
  const trend = zone.trend ? TREND_PRESENTATION[zone.trend] : null

  return (
    <Card
      data-testid={`zone-card-${zone.code}`}
      data-state={zone.state}
      className={cn(
        "group flex flex-col gap-3 border-2 p-4 transition-colors",
        // A CRITICAL card lifts out of the grid rather than merely changing
        // hue, so the most urgent zone is findable at a glance across a wall
        // display — and still findable in greyscale.
        zone.state === "CRITICAL" && "shadow-sm",
        stateBorderClass(zone.state)
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/zones/${zone.id}`}
            className="truncate rounded-sm text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {zone.name}
          </Link>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {zone.code}
            {zone.maintenanceMode && " · maintenance"}
          </p>
        </div>
        <StateBadge state={zone.state} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
              Risk score
            </p>
            <p
              data-numeric
              className="font-mono text-2xl leading-none font-semibold"
            >
              {zone.currentRiskScore.toFixed(1)}
            </p>
          </div>
          {trend && (
            // Trend is advisory and visually separate from the state badge; it
            // never influences state, incidents, priority or actuation.
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border border-border/60 px-1.5 py-0.5 text-[11px]",
                trend.className
              )}
              title="Advisory trend — does not affect zone state"
            >
              <trend.Icon aria-hidden className="size-3" />
              {trend.label}
            </span>
          )}
        </div>

        <RiskMeter score={zone.currentRiskScore} state={zone.state} />
      </div>

      <SensorReadout values={zone.sensorValues} sensors={zone.sensors} />

      <ActuatorStrip actuators={zone.actuators} />

      {zone.activeIncident && (
        <Link
          to={`/incidents?incidentId=${zone.activeIncident.id}`}
          className="flex items-center gap-1.5 rounded border border-critical-border bg-critical-surface px-2 py-1 text-[11px] text-critical transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <AlertOctagon aria-hidden className="size-3 shrink-0" />
          <span className="truncate">
            {zone.activeIncident.status === "ACKNOWLEDGED"
              ? "Incident acknowledged"
              : "Incident open"}{" "}
            · peak {zone.activeIncident.maximumRiskScore.toFixed(0)}
          </span>
        </Link>
      )}

      <p className="line-clamp-2 text-[11px] text-muted-foreground">
        {zone.reasons[0] ?? "No readings yet"}
      </p>

      <div className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock aria-hidden className="size-3" />
        <span>
          {zone.state === "OFFLINE" ? "Last seen " : "Updated "}
          {relativeTime(zone.lastSeenAt)}
        </span>
      </div>
    </Card>
  )
}
