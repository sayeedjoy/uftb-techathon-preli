import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Info } from "lucide-react"
import type { IncidentReportDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, apiGet, apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { useAuth } from "@/features/auth/auth-provider"

/**
 * Natural-language field reports.
 *
 * The extractor is deterministic by default — no paid service is ever required.
 * A submitted report is `PENDING` and influences nothing; only an administrator
 * confirming it grants it a small, bounded contribution to response priority.
 * It can never open an incident, set a zone state, or trigger an actuator.
 */
export function ReportsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const queryClient = useQueryClient()
  const [text, setText] = React.useState("")
  const [lastReport, setLastReport] = React.useState<IncidentReportDto | null>(
    null
  )

  const reports = useQuery({
    queryKey: queryKeys.reports.list(),
    queryFn: () => apiGet<{ reports: IncidentReportDto[] }>("/reports"),
    select: (data) => data.reports,
  })

  const submit = useMutation({
    mutationFn: () =>
      apiPost<{ report: IncidentReportDto }>("/reports/natural-language", {
        text,
      }),
    onSuccess: (result) => {
      setLastReport(result.report)
      setText("")
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() })
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Could not submit the report."
      ),
  })

  const confirm = useMutation({
    mutationFn: (reportId: string) => apiPost(`/reports/${reportId}/confirm`, {}),
    onSuccess: () => {
      toast.success("Report confirmed", {
        description:
          "It may now contribute a bounded bonus to response priority.",
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.list() })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.priorityQueue.all(),
      })
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Could not confirm the report."
      ),
  })

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">Field reports</h1>
        <p className="text-sm text-muted-foreground">
          Describe what you saw in plain language. The system extracts a zone,
          hazard and severity — and waits for a human to confirm it.
        </p>
      </header>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-text">What did you observe?</Label>
          <Textarea
            id="report-text"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Smell of gas near the IoT Lab bench, not sure how bad."
          />
        </div>
        <Button
          className="self-start"
          disabled={text.trim().length < 10 || submit.isPending}
          onClick={() => submit.mutate()}
        >
          Submit report
        </Button>

        {lastReport && (
          <div
            role="status"
            className="rounded border border-sky-500/40 bg-sky-950/20 px-3 py-2 text-xs"
          >
            <p className="font-medium text-sky-200">
              {lastReport.zoneCode ?? "Zone not identified"} ·{" "}
              {lastReport.hazardType?.toLowerCase() ?? "hazard unclassified"} ·
              severity {lastReport.estimatedSeverity}/5 · confidence{" "}
              {Math.round(lastReport.confidence * 100)}%
            </p>
            <p className="mt-1 text-sky-200/80">
              {lastReport.confirmationMessage}
            </p>
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Extraction runs offline and deterministically. A report never creates
          an incident, sets a zone state, or triggers an actuator.
        </p>
      </Card>

      <Card className="p-0">
        <h2 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
          Submitted reports
        </h2>
        {(reports.data?.length ?? 0) === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No reports submitted yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/30">
            {reports.data?.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(report.createdAt).toLocaleString([], {
                      hour12: false,
                    })}{" "}
                    · {report.userName}
                  </p>
                  <p className="mt-0.5">{report.rawText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {report.zoneCode ?? "zone unidentified"} ·{" "}
                    {report.hazardType?.toLowerCase() ?? "unclassified"} ·
                    severity {report.estimatedSeverity}/5 · confidence{" "}
                    {Math.round(report.confidence * 100)}%
                  </p>
                </div>

                <span
                  className={
                    report.status === "CONFIRMED"
                      ? "rounded border border-emerald-600/40 bg-emerald-950/30 px-1.5 py-0.5 text-[11px] text-emerald-300"
                      : report.status === "REJECTED"
                        ? "rounded border border-zinc-600/50 px-1.5 py-0.5 text-[11px] text-zinc-400"
                        : "rounded border border-amber-500/50 bg-amber-950/30 px-1.5 py-0.5 text-[11px] text-amber-300"
                  }
                >
                  {report.status.toLowerCase()}
                </span>

                {isAdmin && report.status === "PENDING" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate(report.id)}
                  >
                    Confirm
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
