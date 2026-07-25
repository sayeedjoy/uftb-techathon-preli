import * as React from "react"
import { Check, ChevronDown, MapPinOff, X } from "lucide-react"
import type { IncidentReportDto } from "@scsrg/shared"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  HAZARD_PRESENTATION,
  absoluteTime,
  relativeTime,
} from "./report-format"
import {
  Chip,
  ConfidenceChip,
  HazardGlyph,
  SeverityMeter,
  StatusPill,
} from "./report-presentation"

/**
 * One report in the review list.
 *
 * The row is ordered the way an administrator reads it: what was said, then who
 * said it and when, then the extraction, then the verdict. The extraction is
 * summarised inline and the backend's confirmation sentence sits behind a
 * disclosure — it is the same paragraph on every card, so repeating it in full
 * would cost the list its scannability without telling anyone anything new.
 *
 * Rejection is irreversible and there is no un-reject endpoint, so the button
 * arms an inline confirmation rather than firing on the first click. Approval
 * has no such step: it is the safe direction and still only grants a bounded
 * priority bonus.
 */
export function ReportCard({
  report,
  canReview,
  busy,
  onApprove,
  onReject,
}: {
  report: IncidentReportDto
  canReview: boolean
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [armed, setArmed] = React.useState(false)
  const detailsId = `report-details-${report.id}`
  const hazard = report.hazardType
    ? HAZARD_PRESENTATION[report.hazardType]
    : null
  const isPending = report.status === "PENDING"

  return (
    <article
      data-testid={`report-${report.id}`}
      className={cn(
        "rounded-lg border bg-card p-3 transition-colors sm:p-4",
        isPending
          ? "border-warning-border/70 hover:border-warning-border"
          : "border-border/60 hover:border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <HazardGlyph hazardType={report.hazardType} />

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium break-words">
            {report.rawText}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.userName} ·{" "}
            <time
              dateTime={report.createdAt}
              title={absoluteTime(report.createdAt)}
            >
              {relativeTime(report.createdAt)}
            </time>
          </p>
        </div>

        <StatusPill status={report.status} />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:pl-11">
        {report.zoneCode ? (
          <Chip>{report.zoneCode}</Chip>
        ) : (
          <Chip className="border-warning-border bg-warning-surface text-warning">
            <MapPinOff aria-hidden className="size-3" />
            No monitored zone
          </Chip>
        )}

        <Chip>
          {hazard ? (
            <>
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", hazard.fill)}
              />
              {hazard.label}
            </>
          ) : (
            "unclassified"
          )}
        </Chip>

        <SeverityMeter severity={report.estimatedSeverity} />
        <ConfidenceChip confidence={report.confidence} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-11">
        <Button
          variant="ghost"
          size="xs"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronDown
            aria-hidden
            className={cn("transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Hide details" : "Details"}
        </Button>

        {canReview && isPending && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {armed ? (
              <>
                <span className="text-xs text-muted-foreground">
                  Reject this report?
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setArmed(false)
                    onReject()
                  }}
                >
                  Confirm reject
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setArmed(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setArmed(true)}
                >
                  <X aria-hidden />
                  Reject
                </Button>
                <Button size="sm" disabled={busy} onClick={onApprove}>
                  <Check aria-hidden />
                  Approve
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div
          id={detailsId}
          className="mt-3 flex flex-col gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground sm:pl-11"
        >
          {/* Rendered verbatim: this sentence is the backend's statement about
              what the report did and did not do, never the frontend's. */}
          <p className="leading-relaxed">{report.confirmationMessage}</p>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground/70">Submitted</dt>
              <dd>{absoluteTime(report.createdAt)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground/70">Extractor</dt>
              <dd>{report.extractorProvider}</dd>
            </div>
            {report.confirmedAt && (
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground/70">Reviewed</dt>
                <dd>{absoluteTime(report.confirmedAt)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </article>
  )
}
