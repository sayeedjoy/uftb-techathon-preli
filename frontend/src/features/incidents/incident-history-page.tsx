import * as React from "react"
import { useSearchParams } from "react-router"
import { useQuery } from "@tanstack/react-query"
import type {
  IncidentSummaryDto,
  PaginationMeta,
  ZoneSummaryDto,
} from "@scsrg/shared"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiGet, request } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { IncidentDrawer } from "@/components/incidents/incident-drawer"
import { IncidentTable } from "@/components/incidents/incident-table"

const FILTER_KEYS = [
  "from",
  "to",
  "zoneId",
  "status",
  "hazardType",
  "acknowledgedBy",
  "page",
] as const

/**
 * Filters live in URL search params, not component state.
 *
 * That is what makes a filtered view survive a reload and be shareable — an
 * operator can paste "everything critical in the server room last night" into
 * a message rather than describing it.
 */
export function IncidentHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = React.useMemo(() => {
    const entries: Record<string, string> = {}
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key)
      if (value) entries[key] = value
    }
    return entries
  }, [searchParams])

  const page = Number(filters.page ?? "1")

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    // Any filter change resets pagination — page 7 of a new filter is meaningless.
    if (key !== "page") next.delete("page")
    setSearchParams(next, { replace: false })
  }

  const zones = useQuery({
    queryKey: queryKeys.zones.list(),
    queryFn: () => apiGet<{ zones: ZoneSummaryDto[] }>("/zones"),
    select: (data) => data.zones,
  })

  const incidents = useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: () =>
      request<{ incidents: IncidentSummaryDto[] }>("/incidents", {
        query: { ...filters, pageSize: 25 },
      }),
  })

  const meta = incidents.data?.meta as PaginationMeta | undefined
  const selectedIncidentId = searchParams.get("incidentId")

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Incident history</h1>
        <p className="text-sm text-muted-foreground">
          Every hazard event, with its complete timeline. Filters are stored in
          the URL, so this view can be reloaded or shared.
        </p>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-from">From</Label>
          <Input
            id="filter-from"
            type="date"
            value={(filters.from ?? "").slice(0, 10)}
            onChange={(event) =>
              setFilter(
                "from",
                event.target.value
                  ? new Date(`${event.target.value}T00:00:00`).toISOString()
                  : ""
              )
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-to">To</Label>
          <Input
            id="filter-to"
            type="date"
            value={(filters.to ?? "").slice(0, 10)}
            onChange={(event) =>
              setFilter(
                "to",
                event.target.value
                  ? new Date(`${event.target.value}T23:59:59`).toISOString()
                  : ""
              )
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-zone">Zone</Label>
          <select
            id="filter-zone"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={filters.zoneId ?? ""}
            onChange={(event) => setFilter("zoneId", event.target.value)}
          >
            <option value="">All zones</option>
            {zones.data?.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <select
            id="filter-status"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={filters.status ?? ""}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="">Any status</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-hazard">Hazard</Label>
          <select
            id="filter-hazard"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={filters.hazardType ?? ""}
            onChange={(event) => setFilter("hazardType", event.target.value)}
          >
            <option value="">Any hazard</option>
            <option value="FIRE">Fire</option>
            <option value="GAS">Gas</option>
            <option value="WATER">Water</option>
            <option value="OCCUPANCY">Occupancy</option>
          </select>
        </div>
      </Card>

      <IncidentTable
        incidents={incidents.data?.data.incidents ?? []}
        isLoading={incidents.isLoading}
        error={incidents.error}
        onSelect={(incidentId) => setFilter("incidentId", incidentId)}
      />

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total} incidents
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setFilter("page", String(page - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasNextPage}
              onClick={() => setFilter("page", String(page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <IncidentDrawer
        incidentId={selectedIncidentId}
        onClose={() => setFilter("incidentId", "")}
      />
    </div>
  )
}
