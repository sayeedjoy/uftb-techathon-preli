import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"
import type { IncidentDetailDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { RiskHistoryChart } from "@/components/charts/risk-history-chart"
import { IncidentTimeline } from "./incident-timeline"

/**
 * The full story of one incident.
 *
 * Deep-linkable via `?incidentId=` so a specific event can be shared with a
 * colleague rather than described.
 */
export function IncidentDrawer({
  incidentId,
  onClose,
}: {
  incidentId: string | null
  onClose: () => void
}) {
  const incident = useQuery({
    queryKey: queryKeys.incidents.detail(incidentId ?? ""),
    queryFn: () =>
      apiGet<{ incident: IncidentDetailDto }>(`/incidents/${incidentId}`),
    select: (data) => data.incident,
    enabled: Boolean(incidentId),
  })

  if (!incidentId) return null

  const detail = incident.data

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Incident detail"
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-background">
        <header className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {detail ? detail.zoneName : "Incident"}
            </h2>
            <p className="font-mono text-[11px] text-muted-foreground">
              {incidentId}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X aria-hidden className="size-4" />
          </Button>
        </header>

        {incident.isLoading && (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Loading incident…
          </p>
        )}

        {incident.error != null && (
          <p role="alert" className="px-5 py-8 text-sm text-critical">
            Could not load this incident.
          </p>
        )}

        {detail && (
          <div className="flex flex-col gap-6 px-5 py-5">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[11px] text-muted-foreground uppercase">
                  Status
                </dt>
                <dd className="font-medium">{detail.status.toLowerCase()}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground uppercase">
                  Peak risk
                </dt>
                <dd className="font-mono tabular-nums">
                  {detail.maximumRiskScore.toFixed(1)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground uppercase">
                  Zone state
                </dt>
                <dd className="font-medium">{detail.zoneState.toLowerCase()}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground uppercase">
                  Started
                </dt>
                <dd className="text-xs">
                  {new Date(detail.startedAt).toLocaleString([], { hour12: false })}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground uppercase">
                  Resolved
                </dt>
                <dd className="text-xs">
                  {detail.resolvedAt
                    ? new Date(detail.resolvedAt).toLocaleString([], {
                        hour12: false,
                      })
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground uppercase">
                  Hazards
                </dt>
                <dd className="text-xs">
                  {detail.dominantHazards.join(", ").toLowerCase() || "—"}
                </dd>
              </div>
            </dl>

            {detail.acknowledgment && (
              <section className="rounded-md border border-info-border bg-info-surface px-3 py-2 text-sm">
                <p className="font-medium text-info">
                  Acknowledged by {detail.acknowledgment.userName}
                </p>
                <p className="text-xs text-info/80">
                  {new Date(detail.acknowledgment.acknowledgedAt).toLocaleString(
                    [],
                    { hour12: false }
                  )}
                  {detail.acknowledgment.note
                    ? ` — “${detail.acknowledgment.note}”`
                    : ""}
                </p>
              </section>
            )}

            {detail.priorityExplanation && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">
                  Why it ranked where it did
                </h3>
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {detail.priorityExplanation.reasons.map((reason) => (
                    <li key={reason}>· {reason}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Risk progression</h3>
              <RiskHistoryChart
                points={detail.readings.map((reading) => ({
                  at: reading.capturedAt,
                  riskScore: reading.riskScore,
                }))}
              />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
              <IncidentTimeline events={detail.timeline} />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Actuation</h3>
              {detail.actuationCommands.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No actuation commands were issued.
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs">
                  {detail.actuationCommands.map((command) => (
                    <li key={command.id} className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {new Date(command.requestedAt).toLocaleTimeString([], {
                          hour12: false,
                        })}
                      </span>
                      <span>{command.type.replace(/_/g, " ").toLowerCase()}</span>
                      <span
                        className={
                          command.source === "MANUAL_OVERRIDE"
                            ? "rounded border border-violet-500/50 bg-violet-950/30 px-1.5 py-0.5 text-[10px] text-violet-300"
                            : "rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        }
                      >
                        {command.source.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span className="text-muted-foreground">
                        {command.status.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
