import type { RiskContributions } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { HAZARD_SEGMENTS } from "./hazard-segments"

function describe(contributions: RiskContributions): string {
  return HAZARD_SEGMENTS.map(
    (segment) => `${segment.label} ${contributions[segment.key].toFixed(1)}`
  ).join(", ")
}

/**
 * The stacked contribution bar.
 *
 * Segments are separated by a surface-coloured gap rather than butting
 * together, so two adjacent fills never read as one. Every segment is also
 * named with its own value below, which means identity never rests on colour
 * alone — the requirement that lets this palette ship at all.
 */
export function ContributionBar({
  contributions,
  className,
}: {
  contributions: RiskContributions
  className?: string
}) {
  const segments = HAZARD_SEGMENTS.map((segment) => ({
    ...segment,
    value: contributions[segment.key],
  })).filter((segment) => segment.value > 0)

  return (
    <div
      role="img"
      aria-label={`Risk contributions: ${describe(contributions)}`}
      className={cn(
        "flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={cn("h-full rounded-full", segment.fill)}
          style={{ width: `${Math.min(100, segment.value)}%` }}
          title={`${segment.label}: ${segment.value.toFixed(1)}`}
        />
      ))}
    </div>
  )
}

/** Compact legend: a swatch, the hazard name, and its weighted points. */
export function ContributionLegend({
  contributions,
  /** Hide zero contributions — on a small card only the live drivers matter. */
  activeOnly = false,
}: {
  contributions: RiskContributions
  activeOnly?: boolean
}) {
  const segments = HAZARD_SEGMENTS.filter(
    (segment) => !activeOnly || contributions[segment.key] > 0
  )

  if (segments.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No hazard is contributing to this score.
      </p>
    )
  }

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
      {segments.map((segment) => (
        <div key={segment.key} className="flex items-center justify-between">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <span
              aria-hidden
              className={cn("inline-block size-2 rounded-sm", segment.fill)}
            />
            {segment.label}
          </dt>
          <dd data-numeric className="font-mono">
            {contributions[segment.key].toFixed(1)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Bar + legend + total, as used on the zone detail page. */
export function ZoneContributions({
  contributions,
}: {
  contributions: RiskContributions
}) {
  const total = HAZARD_SEGMENTS.reduce(
    (sum, segment) => sum + contributions[segment.key],
    0
  )

  return (
    <div className="flex flex-col gap-2">
      <ContributionBar contributions={contributions} className="h-3 rounded" />
      <ContributionLegend contributions={contributions} />
      <p className="text-[11px] text-muted-foreground">
        Total <span data-numeric>{total.toFixed(1)}</span> of 100
      </p>
    </div>
  )
}
