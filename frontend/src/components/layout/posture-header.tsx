import {
  Activity,
  CheckCircle2,
  Database,
  HelpCircle,
  Radio,
  ShieldCheck,
  Siren,
  TriangleAlert,
} from "lucide-react"
import type { DashboardSummaryDto, ZoneState } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ZONE_STATE_PRESENTATION } from "@/components/zones/zone-presentation"

/**
 * The worst state present decides the posture. Deriving it here is safe —
 * it is a restatement of counts the backend computed, not a second opinion
 * about any zone's state.
 */
function posture(summary: DashboardSummaryDto) {
  const { stateCounts, offlineZones, unacknowledgedIncidents } = summary

  if (stateCounts.CRITICAL > 0) {
    return {
      key: "CRITICAL" as const,
      Icon: Siren,
      headline:
        unacknowledgedIncidents > 0
          ? `${unacknowledgedIncidents} incident${unacknowledgedIncidents === 1 ? "" : "s"} need response`
          : `${stateCounts.CRITICAL} zone${stateCounts.CRITICAL === 1 ? "" : "s"} critical`,
      detail: "Ranked in the response queue with the reasoning shown.",
      text: "text-critical",
      surface: "bg-critical-surface",
      border: "border-critical-border",
      pulse: unacknowledgedIncidents > 0,
    }
  }

  if (stateCounts.WARNING > 0) {
    return {
      key: "WARNING" as const,
      Icon: TriangleAlert,
      headline: `${stateCounts.WARNING} zone${stateCounts.WARNING === 1 ? "" : "s"} elevated`,
      detail: "Below the critical threshold. No incident has been opened.",
      text: "text-warning",
      surface: "bg-warning-surface",
      border: "border-warning-border",
      pulse: false,
    }
  }

  if (offlineZones > 0) {
    return {
      key: "OFFLINE" as const,
      Icon: HelpCircle,
      headline: `${offlineZones} zone${offlineZones === 1 ? "" : "s"} not reporting`,
      detail: "Unknown, not safe — the last known state is held.",
      text: "text-offline",
      surface: "bg-offline-surface",
      border: "border-offline-border",
      pulse: false,
    }
  }

  return {
    key: "SAFE" as const,
    Icon: CheckCircle2,
    headline: "All clear",
    detail: "Every zone is reporting and below the warning threshold.",
    text: "text-safe",
    surface: "bg-safe-surface",
    border: "border-safe-border",
    pulse: false,
  }
}

/** Severity-ordered so the bar always reads worst-first, left to right. */
const DISTRIBUTION_ORDER: ZoneState[] = [
  "CRITICAL",
  "WARNING",
  "OFFLINE",
  "SAFE",
]

function StateDistribution({ summary }: { summary: DashboardSummaryDto }) {
  const total = Math.max(1, summary.totalZones)
  const segments = DISTRIBUTION_ORDER.map((state) => ({
    state,
    count: summary.stateCounts[state],
    presentation: ZONE_STATE_PRESENTATION[state],
  })).filter((segment) => segment.count > 0)

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={DISTRIBUTION_ORDER.map(
          (state) => `${ZONE_STATE_PRESENTATION[state].label} ${summary.stateCounts[state]}`
        ).join(", ")}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {segments.map(({ state, count, presentation }) => (
          <div
            key={state}
            className={cn("h-full rounded-full", presentation.meter)}
            style={{ width: `${(count / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Direct labels, so the distribution never depends on colour alone. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {DISTRIBUTION_ORDER.map((state) => {
          const { label, Icon, text } = ZONE_STATE_PRESENTATION[state]
          const count = summary.stateCounts[state]
          return (
            <li
              key={state}
              className={cn(
                "inline-flex items-center gap-1 text-[11px]",
                count > 0 ? text : "text-muted-foreground"
              )}
            >
              <Icon aria-hidden className="size-3" />
              <span>{label}</span>
              <span data-numeric className="font-mono font-semibold">
                {count}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function HealthPill({
  Icon,
  label,
  value,
  tone = "muted",
}: {
  Icon: typeof Radio
  label: string
  value: string
  tone?: "ok" | "warning" | "danger" | "muted"
}) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px]"
    >
      <Icon
        aria-hidden
        className={cn(
          "size-3 shrink-0",
          tone === "ok" && "text-safe",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-critical",
          tone === "muted" && "text-muted-foreground"
        )}
      />
      <span className="text-muted-foreground">{label}</span>
      <span data-numeric className="font-mono font-medium text-foreground">
        {value}
      </span>
    </span>
  )
}

function PostureSkeleton() {
  return (
    <Card aria-busy aria-label="Loading system posture" className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
        <Skeleton className="h-10 w-56" />
      </div>
    </Card>
  )
}

/**
 * The single most important line on the screen: what is the campus doing right
 * now, in words, at a size that survives a projector at the back of a room.
 *
 * Everything here restates backend-computed values. The dashboard never
 * classifies a zone itself.
 */
export function PostureHeader({
  summary,
  isLoading,
}: {
  summary: DashboardSummaryDto | undefined
  isLoading: boolean
}) {
  if (isLoading || !summary) return <PostureSkeleton />

  const state = posture(summary)
  const { health } = summary
  const allReporting = summary.connectedZones === summary.totalZones

  return (
    <Card
      data-testid="posture-header"
      data-posture={state.key}
      className={cn("flex flex-col gap-4 border p-4", state.border, state.surface)}
    >
      <div className="flex flex-wrap items-start gap-4">
        <state.Icon
          aria-hidden
          className={cn(
            "size-9 shrink-0",
            state.text,
            state.pulse && "animate-alert"
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            System posture
          </p>
          <h1
            className={cn(
              "text-xl leading-tight font-semibold tracking-tight sm:text-2xl",
              state.text
            )}
          >
            {state.headline}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{state.detail}</p>
        </div>

        <div className="w-full min-w-0 sm:w-64">
          <StateDistribution summary={summary} />
        </div>
      </div>

      {/* The health rollup the backend already computes, surfaced rather than
          left to the admin-only page: it is the fastest answer to "is the
          dashboard telling me the truth right now?" */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
        <HealthPill
          Icon={ShieldCheck}
          label="Backend"
          value={health.backendStatus}
          tone={health.backendStatus === "OK" ? "ok" : "danger"}
        />
        <HealthPill
          Icon={Database}
          label="Database"
          value={health.databaseConnected ? "connected" : "down"}
          tone={health.databaseConnected ? "ok" : "danger"}
        />
        <HealthPill
          Icon={Radio}
          label="Reporting"
          value={`${summary.connectedZones}/${summary.totalZones}`}
          tone={allReporting ? "ok" : "warning"}
        />
        <HealthPill
          Icon={Activity}
          label="Clients"
          value={String(health.socketConnections)}
        />
        {health.failedActuationCount > 0 && (
          <HealthPill
            Icon={TriangleAlert}
            label="Failed actuations"
            value={String(health.failedActuationCount)}
            tone="danger"
          />
        )}
        {health.recentValidationFailureCount > 0 && (
          <HealthPill
            Icon={TriangleAlert}
            label="Rejected readings"
            value={String(health.recentValidationFailureCount)}
            tone="warning"
          />
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          Server time{" "}
          <time dateTime={summary.serverTime} className="font-mono">
            {new Date(summary.serverTime).toLocaleTimeString([], {
              hour12: false,
            })}
          </time>
        </span>
      </div>
    </Card>
  )
}
