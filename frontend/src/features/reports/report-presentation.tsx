import { CircleHelp } from "lucide-react"
import type { HazardType, ReportStatus } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import {
  HAZARD_PRESENTATION,
  SEVERITY_FILL,
  STATUS_PRESENTATION,
} from "./report-format"

/** The small pieces every report view is built from. */

export function Chip({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: ReportStatus }) {
  const { label, Icon, className } = STATUS_PRESENTATION[status]

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        className
      )}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </span>
  )
}

/** The hazard as a square glyph — the card's fastest-read element. */
export function HazardGlyph({ hazardType }: { hazardType: HazardType | null }) {
  const hazard = hazardType ? HAZARD_PRESENTATION[hazardType] : null
  const Icon = hazard?.Icon ?? CircleHelp

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border",
        hazard
          ? "border-border/60 bg-muted"
          : "border-dashed border-border/60 text-muted-foreground"
      )}
    >
      <Icon className={cn("size-4", hazard && "text-foreground/80")} />
    </span>
  )
}

/**
 * Severity 1–5 as five segments plus the number.
 *
 * The segments are decorative; the sentence beside them is what a screen reader
 * announces, so severity is heard once rather than as five anonymous marks.
 */
export function SeverityMeter({ severity }: { severity: number }) {
  const level = Math.min(5, Math.max(1, Math.round(severity)))

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
      <span aria-hidden className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              "h-2.5 w-1 rounded-[1px]",
              step <= level ? SEVERITY_FILL[level - 1] : "bg-border"
            )}
          />
        ))}
      </span>
      severity {level}/5
    </span>
  )
}

/** Confidence reads as a warning below the halfway mark — it is a hedge, not a fact. */
export function ConfidenceChip({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100)

  return (
    <Chip className={cn(percent < 50 && "border-warning-border text-warning")}>
      {percent}% confidence
    </Chip>
  )
}
