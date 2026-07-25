import * as React from "react"
import { useSearchParams } from "react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, Inbox, SendHorizonal, ShieldCheck } from "lucide-react"
import type { IncidentReportDto, ReportStatus } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, apiGet, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { useSocketEvent } from "@/hooks/use-socket"
import { useAuth } from "@/features/auth/auth-provider"
import { ReportCard } from "./report-card"
import { ReportReply } from "./report-reply"
import { useReportReview } from "./use-report-review"

/**
 * Natural-language field reports, and the administrator's review queue.
 *
 * A submitted report is `PENDING` and influences nothing. Only an administrator
 * approving it grants a small, bounded contribution to response priority; it can
 * never open an incident, set a zone state, or trigger an actuator — whichever
 * extractor read the text.
 *
 * The filter lives in the URL, like every other filtered view in the app, so a
 * supervisor can send someone "the pending queue" as a link.
 */

const MIN_LENGTH = 10
const MAX_LENGTH = 1000

const FILTERS = [
  { key: "all", label: "All", empty: "No reports submitted yet." },
  { key: "PENDING", label: "Pending", empty: "Nothing is waiting for review." },
  {
    key: "CONFIRMED",
    label: "Approved",
    empty: "No report has been approved yet.",
  },
  { key: "REJECTED", label: "Rejected", empty: "No report has been rejected." },
] as const satisfies ReadonlyArray<{
  key: "all" | ReportStatus
  label: string
  empty: string
}>

type FilterKey = (typeof FILTERS)[number]["key"]

function isFilterKey(value: string | null): value is FilterKey {
  return FILTERS.some((filter) => filter.key === value)
}

export function ReportsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [text, setText] = React.useState("")
  const [lastReport, setLastReport] = React.useState<IncidentReportDto | null>(
    null
  )

  const statusParam = searchParams.get("status")
  const filter: FilterKey = isFilterKey(statusParam) ? statusParam : "all"

  const reports = useQuery({
    queryKey: queryKeys.reports.list(),
    queryFn: () => apiGet<{ reports: IncidentReportDto[] }>("/reports"),
    select: (data) => data.reports,
  })

  // Someone else's report should appear here without a reload — the socket
  // invalidates the cache, it never becomes a second source of truth.
  useSocketEvent("report:created", () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() })
  })

  const review = useReportReview()

  const submit = useMutation({
    mutationFn: (value: string) =>
      apiPost<{ report: IncidentReportDto }>("/reports/natural-language", {
        text: value,
      }),
    onSuccess: (result) => {
      setLastReport(result.report)
      setText("")
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() })
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not submit the report."
      ),
  })

  const all = React.useMemo(() => reports.data ?? [], [reports.data])
  const counts = React.useMemo(
    () => ({
      all: all.length,
      PENDING: all.filter((report) => report.status === "PENDING").length,
      CONFIRMED: all.filter((report) => report.status === "CONFIRMED").length,
      REJECTED: all.filter((report) => report.status === "REJECTED").length,
    }),
    [all]
  )
  const visible =
    filter === "all" ? all : all.filter((report) => report.status === filter)

  const trimmed = text.trim()
  const tooShort = trimmed.length < MIN_LENGTH
  const active = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0]

  function setFilter(next: FilterKey) {
    const params = new URLSearchParams(searchParams)
    if (next === "all") params.delete("status")
    else params.set("status", next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Field reports</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            What someone saw, in plain language. The backend extracts a zone,
            hazard and severity — and waits for a human to decide.
          </p>
        </div>

        {isAdmin && counts.PENDING > 0 && (
          <p className="flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-surface px-2.5 py-1 text-xs font-medium text-warning">
            <AlertTriangle aria-hidden className="size-3.5" />
            {counts.PENDING} awaiting your review
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <section className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <h2 className="sr-only">Submitted reports</h2>

          <div
            role="group"
            aria-label="Filter reports by status"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                // Labelled explicitly: read in DOM order the tile announces
                // "3 Pending", which is the count before the thing it counts.
                aria-label={`${entry.label} (${counts[entry.key]})`}
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                className={cn(
                  "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  filter === entry.key
                    ? "border-foreground/25 bg-accent"
                    : "border-border/60 hover:bg-accent/50"
                )}
              >
                <span className="text-lg leading-none font-semibold tabular-nums">
                  {reports.isLoading ? "—" : counts[entry.key]}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {entry.label}
                </span>
              </button>
            ))}
          </div>

          {reports.isLoading ? (
            <div
              aria-busy
              aria-label="Loading reports"
              className="flex flex-col gap-2"
            >
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : reports.isError ? (
            <Card
              role="alert"
              className="flex flex-col items-start gap-2 border-critical-border bg-critical-surface p-4 text-sm text-critical"
            >
              <p>
                {reports.error instanceof ApiError
                  ? reports.error.message
                  : "The report list could not be loaded."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reports.refetch()}
              >
                Try again
              </Button>
            </Card>
          ) : visible.length === 0 ? (
            <Card className="flex flex-col items-center gap-1 px-4 py-12 text-center">
              <Inbox aria-hidden className="size-8 text-muted-foreground/60" />
              <p role="status" className="mt-1 text-sm font-medium">
                {active.empty}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Reports arrive here from the field-report bar on any screen.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((report) => (
                <li key={report.id}>
                  <ReportCard
                    report={report}
                    canReview={isAdmin}
                    busy={
                      (review.approve.isPending &&
                        review.approve.variables === report.id) ||
                      (review.reject.isPending &&
                        review.reject.variables === report.id)
                    }
                    onApprove={() => review.approve.mutate(report.id)}
                    onReject={() => review.reject.mutate(report.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="order-1 flex flex-col gap-3 lg:sticky lg:top-4 lg:order-2">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-text">What did you observe?</Label>
              <Textarea
                id="report-text"
                rows={4}
                value={text}
                maxLength={MAX_LENGTH}
                aria-describedby="report-text-hint"
                onChange={(event) => setText(event.target.value)}
                placeholder="Smell of gas near the soldering bench in the IoT Lab, not sure how bad."
                className="resize-none text-sm"
              />
              <p
                id="report-text-hint"
                className={cn(
                  "text-[11px]",
                  tooShort && trimmed.length > 0
                    ? "text-warning"
                    : "text-muted-foreground"
                )}
              >
                {tooShort && trimmed.length > 0
                  ? `${MIN_LENGTH - trimmed.length} more characters needed`
                  : "Any language. Name the place and what you saw."}
              </p>
            </div>

            <Button
              disabled={tooShort || submit.isPending}
              onClick={() => submit.mutate(trimmed)}
            >
              <SendHorizonal aria-hidden />
              {submit.isPending ? "Extracting…" : "Submit report"}
            </Button>

            {lastReport && (
              <div role="status">
                <ReportReply report={lastReport} />
              </div>
            )}
          </Card>

          <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
            Advisory only. A report never creates an incident, sets a zone state
            or triggers an actuator — approving one grants nothing beyond a
            bounded bonus to response priority.
          </p>
        </aside>
      </div>
    </div>
  )
}
