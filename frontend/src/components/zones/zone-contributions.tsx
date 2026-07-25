import type { RiskContributions } from "@scsrg/shared"

const SEGMENTS = [
  { key: "fire", label: "Fire", className: "bg-red-500" },
  { key: "gas", label: "Gas", className: "bg-amber-500" },
  { key: "water", label: "Water", className: "bg-sky-500" },
  { key: "occupancy", label: "Occupancy", className: "bg-violet-500" },
] as const satisfies ReadonlyArray<{
  key: keyof RiskContributions
  label: string
  className: string
}>

/**
 * Stacked contribution bar.
 *
 * Each segment is labelled with its own value beneath the bar, so the split is
 * readable without relying on being able to distinguish four colours.
 */
export function ZoneContributions({
  contributions,
}: {
  contributions: RiskContributions
}) {
  const total = SEGMENTS.reduce(
    (sum, segment) => sum + contributions[segment.key],
    0
  )

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Risk contributions: ${SEGMENTS.map(
          (segment) => `${segment.label} ${contributions[segment.key]}`
        ).join(", ")}`}
        className="flex h-3 w-full overflow-hidden rounded bg-muted"
      >
        {SEGMENTS.map((segment) => {
          const value = contributions[segment.key]
          if (value <= 0) return null
          return (
            <div
              key={segment.key}
              className={segment.className}
              style={{ width: `${Math.min(100, value)}%` }}
              title={`${segment.label}: ${value}`}
            />
          )
        })}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden
                className={`inline-block size-2 rounded-sm ${segment.className}`}
              />
              {segment.label}
            </dt>
            <dd className="font-mono tabular-nums">
              {contributions[segment.key].toFixed(1)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-[11px] text-muted-foreground">
        Total {total.toFixed(1)} of 100
      </p>
    </div>
  )
}
