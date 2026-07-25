import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type {
  ScenarioRunResultDto,
  SimulatorStatusDto,
  SimulatorZoneStateDto,
} from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { useSocketEvent } from "@/hooks/use-socket"
import { PayloadInspector, type InspectorEntry } from "@/components/simulator/payload-inspector"

/** The slider reports either a scalar or a range depending on its mode. */
function firstSliderValue(value: number | readonly number[]): number {
  return typeof value === "number" ? value : (value[0] ?? 0)
}

/**
 * The simulator control surface.
 *
 * It never mutates dashboard state directly: every control calls the backend
 * engine, which POSTs to the real ingestion API with a server-held zone key.
 * Everything shown here comes back through the normal API/socket path — no zone
 * API key ever exists in the browser.
 */
function ZoneSimulatorCard({
  zone,
  onPatch,
  onStart,
  onStop,
  onFault,
  busy,
}: {
  zone: SimulatorZoneStateDto
  onPatch: (patch: Record<string, unknown>) => void
  onStart: () => void
  onStop: () => void
  onFault: (fault: string) => void
  busy: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{zone.zoneName}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {zone.zoneCode} · seq {zone.sequenceNumber}
          </p>
        </div>
        <span
          className={
            zone.hasCredential
              ? "rounded border border-safe-border bg-safe-surface px-1.5 py-0.5 text-[10px] text-safe"
              : "rounded border border-critical-border bg-critical-surface px-1.5 py-0.5 text-[10px] text-critical"
          }
        >
          {zone.hasCredential ? "key loaded" : "no key — run pnpm db:seed"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onStart} disabled={busy || zone.running}>
          Start
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onStop}
          disabled={busy || !zone.running}
        >
          Stop
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {zone.running ? `streaming every ${zone.intervalMs}ms` : "stopped"} ·
          sent {zone.sentCount} · accepted {zone.acceptedCount} · rejected{" "}
          {zone.rejectedCount}
          {zone.lastStatusCode !== null && ` · last HTTP ${zone.lastStatusCode}`}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`fire-${zone.zoneId}`} className="text-xs">
            Fire
          </Label>
          <Switch
            id={`fire-${zone.zoneId}`}
            checked={zone.fireDetected}
            onCheckedChange={(checked) => onPatch({ fireDetected: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`occupancy-${zone.zoneId}`} className="text-xs">
            Occupancy
          </Label>
          <Switch
            id={`occupancy-${zone.zoneId}`}
            checked={zone.occupancyDetected}
            onCheckedChange={(checked) =>
              onPatch({ occupancyDetected: checked })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            Gas {Math.round(zone.gasLevel * 100)}%
          </Label>
          <Slider
            value={[zone.gasLevel * 100]}
            max={100}
            step={5}
            onValueChange={(value) =>
              onPatch({ gasLevel: firstSliderValue(value) / 100 })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">
            Water {Math.round(zone.waterLevel * 100)}%
          </Label>
          <Slider
            value={[zone.waterLevel * 100]}
            max={100}
            step={5}
            onValueChange={(value) =>
              onPatch({ waterLevel: firstSliderValue(value) / 100 })
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id={`network-${zone.zoneId}`}
            checked={zone.networkDisconnected}
            onCheckedChange={(checked) =>
              onPatch({ networkDisconnected: checked })
            }
          />
          <Label htmlFor={`network-${zone.zoneId}`} className="text-xs">
            Cut network (drives OFFLINE)
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id={`sensor-${zone.zoneId}`}
            checked={zone.disconnectedSensors.includes("OCCUPANCY")}
            onCheckedChange={(checked) =>
              onPatch({ disconnectedSensors: checked ? ["OCCUPANCY"] : [] })
            }
          />
          <Label htmlFor={`sensor-${zone.zoneId}`} className="text-xs">
            Disconnect occupancy sensor
          </Label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
        <span className="w-full text-[11px] text-muted-foreground">
          Fault injection — the backend&apos;s real status code is shown below.
        </span>
        {(
          [
            ["MALFORMED_PAYLOAD", "Malformed (400)"],
            ["IMPOSSIBLE_VALUE", "Gas above 1 (422)"],
            ["DUPLICATE_READING", "Duplicate (409)"],
            ["OUT_OF_ORDER_READING", "Out of order"],
            ["QUICK_CYCLE", "Quick cycle"],
          ] as const
        ).map(([faultName, label]) => (
          <Button
            key={faultName}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onFault(faultName)}
          >
            {label}
          </Button>
        ))}
      </div>
    </Card>
  )
}

export function SimulatorPage() {
  const queryClient = useQueryClient()
  const [entries, setEntries] = React.useState<InspectorEntry[]>([])
  const [scenarioResult, setScenarioResult] =
    React.useState<ScenarioRunResultDto | null>(null)

  const status = useQuery({
    queryKey: queryKeys.simulator.status(),
    queryFn: () => apiGet<SimulatorStatusDto>("/simulator/status"),
    refetchInterval: 4_000,
  })

  // Payload and response arrive over the socket, not from local state — the
  // page shows what the backend actually saw.
  useSocketEvent("simulator:payload", (payload) => {
    setEntries((previous) =>
      [
        {
          id: payload.eventId,
          kind: "payload" as const,
          zoneCode: payload.zoneCode,
          at: payload.sentAt,
          body: payload.payload,
        },
        ...previous,
      ].slice(0, 40)
    )
  })

  useSocketEvent("simulator:response", (payload) => {
    setEntries((previous) =>
      [
        {
          id: payload.eventId,
          kind: "response" as const,
          zoneCode: payload.zoneCode,
          at: payload.receivedAt,
          statusCode: payload.statusCode,
          body: payload.body,
        },
        ...previous,
      ].slice(0, 40)
    )
  })

  useSocketEvent("simulator:status", () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.simulator.status(),
    })
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: queryKeys.simulator.status(),
    })

  const start = useMutation({
    mutationFn: (zoneId: string) => apiPost(`/simulator/zones/${zoneId}/start`),
    onSuccess: invalidate,
  })
  const stop = useMutation({
    mutationFn: (zoneId: string) => apiPost(`/simulator/zones/${zoneId}/stop`),
    onSuccess: invalidate,
  })
  const patch = useMutation({
    mutationFn: ({ zoneId, body }: { zoneId: string; body: unknown }) =>
      apiPatch(`/simulator/zones/${zoneId}/state`, body),
    onSuccess: invalidate,
  })
  const fault = useMutation({
    mutationFn: ({ zoneId, faultName }: { zoneId: string; faultName: string }) =>
      apiPost<{ statusCode: number; description: string }>(
        `/simulator/zones/${zoneId}/fault`,
        { fault: faultName }
      ),
    onSuccess: (result) =>
      toast.info(`Backend responded ${result.statusCode}`, {
        description: result.description,
      }),
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Fault injection failed"
      ),
  })

  const runScenario = useMutation({
    mutationFn: (scenarioId: number) =>
      apiPost<{ result: ScenarioRunResultDto }>(
        `/simulator/scenarios/${scenarioId}/run`,
        {}
      ),
    onSuccess: (result) => {
      setScenarioResult(result.result)
      toast[result.result.passed ? "success" : "warning"](
        `Scenario ${result.result.scenarioId}: ${result.result.name}`,
        {
          description: result.result.passed
            ? "All assertions passed."
            : "Some assertions did not pass — see the results panel.",
        }
      )
      invalidate()
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Scenario run failed"
      ),
  })

  const busy =
    start.isPending || stop.isPending || fault.isPending || runScenario.isPending

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Sensor simulator</h1>
        <p className="text-sm text-muted-foreground">
          Drives the real ingestion API over HTTP with server-held zone keys. No
          API key ever reaches this page, and nothing here writes to the
          dashboard directly.
        </p>
      </header>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Demonstration scenarios</h2>
        <div className="flex flex-wrap gap-2">
          {status.data?.scenarios.map((scenario) => (
            <Button
              key={scenario.id}
              size="sm"
              variant="outline"
              disabled={busy}
              title={`${scenario.description} (~${Math.round(scenario.estimatedDurationMs / 1000)}s)`}
              onClick={() => runScenario.mutate(scenario.id)}
            >
              {scenario.id}. {scenario.name}
            </Button>
          ))}
        </div>

        {status.data?.activeScenario && !status.data.activeScenario.finished && (
          <p className="text-xs text-warning">
            Running “{status.data.activeScenario.name}” —{" "}
            {status.data.activeScenario.progress}% complete.
          </p>
        )}

        {scenarioResult && (
          <div className="rounded border border-border/60 p-3 text-xs">
            <p className="font-medium">
              {scenarioResult.name} ·{" "}
              <span
                className={
                  scenarioResult.passed ? "text-safe" : "text-warning"
                }
              >
                {scenarioResult.passed ? "passed" : "needs review"}
              </span>
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {scenarioResult.assertions.map((assertion) => (
                <li key={assertion.description}>
                  <span
                    className={
                      assertion.passed ? "text-safe" : "text-critical"
                    }
                  >
                    {assertion.passed ? "✓" : "✗"}
                  </span>{" "}
                  {assertion.description} —{" "}
                  <span className="text-muted-foreground">
                    {assertion.detail}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {status.data?.zones.map((zone) => (
          <ZoneSimulatorCard
            key={zone.zoneId}
            zone={zone}
            busy={busy}
            onStart={() => start.mutate(zone.zoneId)}
            onStop={() => stop.mutate(zone.zoneId)}
            onPatch={(body) => patch.mutate({ zoneId: zone.zoneId, body })}
            onFault={(faultName) =>
              fault.mutate({ zoneId: zone.zoneId, faultName })
            }
          />
        ))}
      </div>

      <PayloadInspector entries={entries} />
    </div>
  )
}
