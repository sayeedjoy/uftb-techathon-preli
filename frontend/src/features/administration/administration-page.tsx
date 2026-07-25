import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { OVERRIDE_ACTIONS, type ManualOverrideDto, type ZoneSummaryDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, apiGet, apiPatch, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

const MIN_REASON_LENGTH = 5

function OverrideConsole({ zones }: { zones: ZoneSummaryDto[] }) {
  const queryClient = useQueryClient()
  const [zoneId, setZoneId] = React.useState("")
  const [action, setAction] = React.useState<string>(OVERRIDE_ACTIONS[0])
  const [reason, setReason] = React.useState("")
  const [lastResult, setLastResult] = React.useState<ManualOverrideDto | null>(
    null
  )

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ override: ManualOverrideDto }>(
        `/admin/zones/${zoneId}/overrides`,
        { action, reason }
      ),
    onSuccess: (result) => {
      setLastResult(result.override)
      setReason("")
      toast.success("Override applied", {
        description: `${result.override.action} on ${result.override.zoneCode}`,
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones.list() })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.auditLogs({}),
      })
    },
    onError: (error) =>
      toast.error("Override rejected", {
        description: error instanceof ApiError ? error.message : "Try again.",
      }),
  })

  // Submit stays disabled until a reason exists — the audit trail's only
  // human context is not optional.
  const canSubmit =
    zoneId.length > 0 && reason.trim().length >= MIN_REASON_LENGTH

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Override console</h2>
        <p className="text-xs text-muted-foreground">
          Every override is recorded with your name, the time, the reason and the
          affected zone, and is tagged as a manual action so it is never confused
          with a sensor-triggered response.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-zone">Zone</Label>
          <select
            id="override-zone"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={zoneId}
            onChange={(event) => setZoneId(event.target.value)}
          >
            <option value="">Select a zone…</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="override-action">Action</Label>
          <select
            id="override-action"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            {OVERRIDE_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="override-reason">
          Reason <span className="text-muted-foreground">(required)</span>
        </Label>
        <Textarea
          id="override-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this override necessary?"
        />
        {reason.length > 0 && reason.trim().length < MIN_REASON_LENGTH && (
          <p className="text-xs text-amber-400">
            At least {MIN_REASON_LENGTH} characters are required.
          </p>
        )}
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={!canSubmit || mutation.isPending}
        className="self-start"
      >
        Apply override
      </Button>

      {lastResult && (
        <p className="rounded border border-violet-500/40 bg-violet-950/20 px-3 py-2 text-xs text-violet-200">
          Recorded: {lastResult.action.replace(/_/g, " ").toLowerCase()} on{" "}
          {lastResult.zoneCode} by {lastResult.userName} at{" "}
          {new Date(lastResult.createdAt).toLocaleTimeString([], { hour12: false })}
          . An audit entry was written.
        </p>
      )}
    </Card>
  )
}

function ZoneAdmin({ zones }: { zones: ZoneSummaryDto[] }) {
  const queryClient = useQueryClient()

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch(`/admin/zones/${id}`, { isActive }),
    onSuccess: () => {
      toast.success("Zone updated")
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones.list() })
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Could not update the zone."
      ),
  })

  return (
    <Card className="p-0">
      <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
        Zones
      </h2>
      <ul className="divide-y divide-border/30">
        {zones.map((zone) => (
          <li
            key={zone.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{zone.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {zone.code} · importance {zone.assetImportance} ·{" "}
                {zone.sensors.length} sensors
                {zone.maintenanceMode && " · maintenance mode"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={toggleActive.isPending}
              onClick={() =>
                toggleActive.mutate({ id: zone.id, isActive: !zone.isActive })
              }
            >
              {zone.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          </li>
        ))}
      </ul>
      <p className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
        Zones are never hard-deleted while incidents reference them —
        deactivation is the supported removal path.
      </p>
    </Card>
  )
}

function CreateZoneForm() {
  const queryClient = useQueryClient()
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [assetImportance, setAssetImportance] = React.useState(4)
  const [issuedKey, setIssuedKey] = React.useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      apiPost<{ apiKey: string }>("/admin/zones", {
        code,
        name,
        assetImportance,
        sensors: [
          { type: "FLAME", name: "Flame detector", isCritical: true },
          { type: "GAS", name: "Gas sensor", isCritical: false },
          { type: "OCCUPANCY", name: "Occupancy sensor", isCritical: false },
        ],
      }),
    onSuccess: (result) => {
      setIssuedKey(result.apiKey)
      setCode("")
      setName("")
      toast.success("Zone created")
      void queryClient.invalidateQueries({ queryKey: queryKeys.zones.list() })
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Could not create the zone."
      ),
  })

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">Add a zone</h2>
        <p className="text-xs text-muted-foreground">
          A new zone is data, not code: it can start ingesting immediately with
          the key issued below.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zone-code">Code</Label>
          <Input
            id="zone-code"
            value={code}
            placeholder="chem-lab"
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zone-name">Name</Label>
          <Input
            id="zone-name"
            value={name}
            placeholder="Chemistry Lab"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="zone-importance">Asset importance (0–8)</Label>
          <Input
            id="zone-importance"
            type="number"
            min={0}
            max={8}
            value={assetImportance}
            onChange={(event) => setAssetImportance(Number(event.target.value))}
          />
        </div>
      </div>

      <Button
        className="self-start"
        disabled={code.length < 2 || name.length < 2 || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Create zone
      </Button>

      {issuedKey && (
        <div className="rounded border border-amber-500/50 bg-amber-950/20 px-3 py-2 text-xs">
          <p className="font-medium text-amber-200">
            API key — shown once, never retrievable again
          </p>
          <p className="mt-1 font-mono break-all">{issuedKey}</p>
        </div>
      )}
    </Card>
  )
}

export function AdministrationPage() {
  const zones = useQuery({
    queryKey: queryKeys.zones.list(),
    queryFn: () => apiGet<{ zones: ZoneSummaryDto[] }>("/zones"),
    select: (data) => data.zones,
  })

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Zone configuration and the manual override console. Every action here
          is audited.
        </p>
      </header>

      <OverrideConsole zones={zones.data ?? []} />
      <CreateZoneForm />
      <ZoneAdmin zones={zones.data ?? []} />
    </div>
  )
}
