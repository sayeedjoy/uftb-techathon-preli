import * as React from "react"
import { Link, useParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import type {
  SensorReadingDto,
  ZoneDetailDto,
  ZoneStateTransitionDto,
  ZoneSummaryDto,
} from "@scsrg/shared"

import { Card } from "@/components/ui/card"
import { apiGet } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { useAuth } from "@/features/auth/auth-provider"
import { getSocket } from "@/lib/socket"
import { useSocketEvent } from "@/hooks/use-socket"
import { ActuatorStrip } from "@/components/zones/actuator-strip"
import { SensorReadout } from "@/components/zones/sensor-readout"
import { StateBadge } from "@/components/zones/state-badge"
import { RiskHistoryChart } from "@/components/charts/risk-history-chart"
import { ZoneContributions } from "@/components/zones/zone-contributions"

export function ZoneDetailPage() {
  const { zoneId = "" } = useParams()
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"

  const zone = useQuery({
    queryKey: queryKeys.zones.detail(zoneId),
    queryFn: () => apiGet<{ zone: ZoneDetailDto }>(`/zones/${zoneId}`),
    select: (data) => data.zone,
    enabled: Boolean(zoneId),
  })

  const transitions = useQuery({
    queryKey: queryKeys.zones.transitions(zoneId),
    queryFn: () =>
      apiGet<{ transitions: ZoneStateTransitionDto[] }>(
        `/zones/${zoneId}/transitions`
      ),
    select: (data) => data.transitions,
    enabled: Boolean(zoneId),
  })

  // Raw readings are admin-only; staff get the summarised view above.
  const readings = useQuery({
    queryKey: queryKeys.zones.readings(zoneId, 1),
    queryFn: () =>
      apiGet<{ readings: SensorReadingDto[] }>(`/zones/${zoneId}/readings`, {
        pageSize: 120,
      }),
    select: (data) => data.readings,
    enabled: Boolean(zoneId) && isAdmin,
  })

  // Join the zone-specific room so this page gets its own live updates.
  React.useEffect(() => {
    const socket = getSocket()
    if (!socket || !zoneId) return
    socket.emit("zone:subscribe", zoneId)
    return () => {
      socket.emit("zone:unsubscribe", zoneId)
    }
  }, [zoneId])

  const [live, setLive] = React.useState<ZoneSummaryDto | null>(null)
  useSocketEvent("zone:updated", (payload) => {
    if (payload.zone.id === zoneId) setLive(payload.zone)
  })

  const current = live ?? zone.data

  if (zone.isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading zone…</Card>
  }

  if (zone.error != null || !zone.data || !current) {
    return (
      <Card role="alert" className="border-critical-border p-6 text-sm text-critical">
        Could not load this zone.{" "}
        <Link to="/" className="underline">
          Back to the Command Center
        </Link>
      </Card>
    )
  }

  const detail = zone.data

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{detail.name}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {detail.code} · {detail.location ?? "location not set"} · asset
            importance {detail.assetImportance}
          </p>
        </div>
        <StateBadge state={current.state} />
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Current reading</h2>
          <p className="font-mono text-3xl leading-none font-semibold tabular-nums">
            {current.currentRiskScore.toFixed(1)}
          </p>
          <SensorReadout
            values={current.sensorValues}
            sensors={current.sensors}
          />
          <ActuatorStrip actuators={current.actuators} />
          <p className="text-[11px] text-muted-foreground">
            Last seen{" "}
            {current.lastSeenAt
              ? new Date(current.lastSeenAt).toLocaleString([], { hour12: false })
              : "never"}
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Risk contributions</h2>
          <ZoneContributions contributions={current.contributions} />
          <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            {current.reasons.map((reason) => (
              <li key={reason}>· {reason}</li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Configuration</h2>
          <ul className="flex flex-col gap-1.5 text-xs">
            {detail.configuration.sensors.map((sensor) => (
              <li
                key={sensor.id}
                className="flex items-center justify-between gap-2"
              >
                <span>
                  {sensor.name}
                  {sensor.isCritical && (
                    <span className="ml-1 rounded border border-warning-border px-1 text-[10px] text-warning">
                      critical
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {sensor.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Offline after {detail.configuration.offlineTimeoutMs / 1000}s of
            silence · gas warm-up {detail.configuration.gasWarmupMs / 1000}s
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Recent risk history</h2>
        {isAdmin ? (
          <RiskHistoryChart
            points={[...(readings.data ?? [])]
              .reverse()
              .map((reading) => ({
                at: reading.capturedAt,
                riskScore: reading.riskScore,
              }))}
            height={240}
          />
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            Raw sensor history is available to administrators. The summarised
            state, contributions and transition history above are complete.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">State transitions</h2>
        {(transitions.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">
            No state changes recorded yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5 text-xs">
            {transitions.data?.map((transition) => (
              <li key={transition.id} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                  {new Date(transition.createdAt).toLocaleString([], {
                    hour12: false,
                  })}
                </span>
                <span className="font-medium">
                  {transition.previousState ?? "—"} → {transition.newState}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  risk {transition.riskScore.toFixed(1)}
                </span>
                <span className="text-muted-foreground">{transition.reason}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
