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
import { DateField } from "@/components/filters/date-field"
import { FilterSelect } from "@/components/filters/filter-select"
import { apiGet, request } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { IncidentDrawer } from "@/components/incidents/incident-drawer"
import { IncidentTable } from "@/components/incidents/incident-table"

/** Sentinel for "no filter" — see the note in `FilterSelect`. */
const ANY = "__any__"

const STATUS_OPTIONS = [
  { value: ANY, label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "RESOLVED", label: "Resolved" },
] as const

const HAZARD_OPTIONS = [
  { value: ANY, label: "Any hazard" },
  { value: "FIRE", label: "Fire" },
  { value: "GAS", label: "Gas" },
  { value: "WATER", label: "Water" },
  { value: "OCCUPANCY", label: "Occupancy" },
] as const

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
        <DateField
          id="filter-from"
          label="From"
          boundary="start"
          value={filters.from ?? ""}
          onChange={(value) => setFilter("from", value)}
        />

        <DateField
          id="filter-to"
          label="To"
          boundary="end"
          value={filters.to ?? ""}
          onChange={(value) => setFilter("to", value)}
        />

        <FilterSelect
          id="filter-zone"
          label="Zone"
          value={filters.zoneId ?? ANY}
          onValueChange={(value) =>
            setFilter("zoneId", value === ANY ? "" : value)
          }
          options={[
            { value: ANY, label: "All zones" },
            ...(zones.data ?? []).map((zone) => ({
              value: zone.id,
              label: zone.name,
            })),
          ]}
        />

        <FilterSelect
          id="filter-status"
          label="Status"
          value={filters.status ?? ANY}
          onValueChange={(value) =>
            setFilter("status", value === ANY ? "" : value)
          }
          options={STATUS_OPTIONS}
        />

        <FilterSelect
          id="filter-hazard"
          label="Hazard"
          value={filters.hazardType ?? ANY}
          onValueChange={(value) =>
            setFilter("hazardType", value === ANY ? "" : value)
          }
          options={HAZARD_OPTIONS}
        />
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
