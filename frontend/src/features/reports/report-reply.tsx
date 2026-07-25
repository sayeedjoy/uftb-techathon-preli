import { AlertTriangle, MapPinOff } from "lucide-react"
import type { IncidentReportDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { HAZARD_PRESENTATION } from "./report-format"
import { Chip } from "./report-presentation"

/**
 * One extracted report, rendered as the assistant's turn in the transcript.
 *
 * The chips carry the structured extraction; the prose beneath is the backend's
 * confirmation message, rendered verbatim. The frontend never composes that
 * sentence — it is the backend's statement about what the report did and did
 * not do, and paraphrasing it here would be a second, drifting source of truth.
 */
export function ReportReply({ report }: { report: IncidentReportDto }) {
  const unmatched = report.zoneCode === null
  const hazard = report.hazardType
    ? HAZARD_PRESENTATION[report.hazardType]
    : null

  return (
    <div className="flex flex-col gap-2 rounded-lg rounded-bl-sm border border-border/60 bg-card px-3 py-2.5">
      <div className="flex flex-wrap gap-1.5">
        <Chip
          className={cn(
            unmatched && "border-warning-border bg-warning-surface text-warning"
          )}
        >
          {unmatched ? (
            <>
              <MapPinOff aria-hidden className="size-3" />
              No monitored zone
            </>
          ) : (
            report.zoneCode
          )}
        </Chip>

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

        <Chip>severity {report.estimatedSeverity}/5</Chip>
        <Chip>{Math.round(report.confidence * 100)}% confidence</Chip>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {report.confirmationMessage}
      </p>

      {/* Status is never carried by colour alone — the icon and the word both
          say "pending", so a colour-blind operator reads the same thing. */}
      <p className="flex items-center gap-1.5 text-[11px] text-warning">
        <AlertTriangle aria-hidden className="size-3 shrink-0" />
        Pending — awaiting supervisor confirmation
      </p>
    </div>
  )
}
