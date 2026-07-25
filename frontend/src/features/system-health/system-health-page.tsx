import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Database, Radio } from "lucide-react"
import type { SystemHealthDto } from "@scsrg/shared"

import { Card } from "@/components/ui/card"
import { apiGet } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

function Stat({
  Icon,
  label,
  value,
  ok,
}: {
  Icon: typeof Radio
  label: string
  value: string | number
  ok: boolean
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <Icon
        aria-hidden
        className={ok ? "size-5 text-emerald-400" : "size-5 text-amber-400"}
      />
      <div>
        <p className="font-mono text-lg leading-none font-semibold tabular-nums">
          {value}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
      </div>
    </Card>
  )
}

export function SystemHealthPage() {
  const health = useQuery({
    queryKey: queryKeys.admin.systemHealth(),
    queryFn: () => apiGet<SystemHealthDto>("/admin/system-health"),
    refetchInterval: 10_000,
  })

  if (health.isLoading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Loading system health…
      </Card>
    )
  }

  if (health.error != null || !health.data) {
    return (
      <Card role="alert" className="border-red-500/50 p-6 text-sm text-red-300">
        Could not load system health.
      </Card>
    )
  }

  const data = health.data

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">System health</h1>
        <p className="text-sm text-muted-foreground">
          Backend, database, transport and per-zone connectivity.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          Icon={CheckCircle2}
          label="Backend status"
          value={data.backendStatus}
          ok={data.backendStatus === "OK"}
        />
        <Stat
          Icon={Database}
          label={`Database${
            data.databaseLatencyMs !== null ? ` · ${data.databaseLatencyMs}ms` : ""
          }`}
          value={data.databaseConnected ? "Connected" : "Down"}
          ok={data.databaseConnected}
        />
        <Stat
          Icon={Radio}
          label="Socket connections"
          value={data.socketConnections}
          ok
        />
        <Stat
          Icon={AlertTriangle}
          label="Offline zones"
          value={data.offlineZones.length}
          ok={data.offlineZones.length === 0}
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
          Zone connectivity
        </h2>
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Zone</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Last seen</th>
              <th className="px-4 py-2 font-medium">Last reading</th>
              <th className="px-4 py-2 font-medium">Sensors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {data.zones.map((zone) => (
              <tr key={zone.zoneId} className={zone.isOffline ? "bg-amber-950/20" : ""}>
                <td className="px-4 py-2">{zone.zoneName}</td>
                <td className="px-4 py-2">{zone.state.toLowerCase()}</td>
                <td className="px-4 py-2 text-xs">
                  {zone.secondsSinceLastSeen === null
                    ? "never"
                    : `${zone.secondsSinceLastSeen}s ago`}
                </td>
                <td className="px-4 py-2 text-xs">
                  {zone.lastReadingAt
                    ? new Date(zone.lastReadingAt).toLocaleTimeString([], {
                        hour12: false,
                      })
                    : "—"}
                </td>
                <td className="px-4 py-2 text-xs">
                  {zone.sensors
                    .map((sensor) => `${sensor.type.toLowerCase()}:${sensor.status.toLowerCase()}`)
                    .join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
            Failed actuation commands
          </h2>
          {data.failedActuationCommands.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              No failed commands.
            </p>
          ) : (
            <ul className="divide-y divide-border/30 text-xs">
              {data.failedActuationCommands.map((command) => (
                <li key={command.id} className="px-4 py-2">
                  {command.zoneCode} · {command.type.toLowerCase()} ·{" "}
                  {command.status.toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-0">
          <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
            Recent validation failures
          </h2>
          {data.recentValidationFailures.length === 0 ? (
            <p className="px-4 py-4 text-xs text-muted-foreground">
              No recent validation failures.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-border/30 overflow-y-auto text-xs">
              {data.recentValidationFailures.map((event) => (
                <li key={event.id} className="px-4 py-2">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(event.createdAt).toLocaleTimeString([], {
                      hour12: false,
                    })}
                  </span>{" "}
                  {event.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-0">
        <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
          Recent system events
        </h2>
        <ul className="max-h-80 divide-y divide-border/30 overflow-y-auto text-xs">
          {data.recentSystemEvents.map((event) => (
            <li key={event.id} className="flex items-start gap-2 px-4 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {new Date(event.createdAt).toLocaleString([], { hour12: false })}
              </span>
              <span
                className={
                  event.severity === "ERROR"
                    ? "text-red-300"
                    : event.severity === "WARN"
                      ? "text-amber-300"
                      : "text-muted-foreground"
                }
              >
                {event.severity}
              </span>
              <span className="min-w-0 flex-1">{event.message}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
