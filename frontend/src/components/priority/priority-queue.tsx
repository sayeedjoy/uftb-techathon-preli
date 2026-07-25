import * as React from "react"
import { CheckCircle2, ListOrdered, Users, UserX, HelpCircle } from "lucide-react"
import type { PriorityBreakdown, PriorityQueueEntryDto } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`
}

/** The score breakdown as labelled chips — rank 1 vs rank 2 must be legible. */
function BreakdownChips({ breakdown }: { breakdown: PriorityBreakdown }) {
  const chips: Array<[string, number]> = [
    ["risk", breakdown.risk],
    ["occupied", breakdown.occupancy],
    ["duration", breakdown.duration],
    ["asset", breakdown.asset],
    ["multi-hazard", breakdown.multiHazard],
    ["acknowledged", breakdown.acknowledged],
    ["human report", breakdown.humanReport],
  ]

  return (
    <div className="flex flex-wrap gap-1">
      {chips
        .filter(([label, value]) => value !== 0 || label === "risk")
        .map(([label, value]) => (
          <span
            key={label}
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[11px]",
              value < 0
                ? "border-sky-500/40 bg-sky-950/30 text-sky-300"
                : "border-border/60 bg-muted/40 text-muted-foreground"
            )}
          >
            {label} {value > 0 && label !== "risk" ? "+" : ""}
            {value}
          </span>
        ))}
    </div>
  )
}

const OCCUPANCY_PRESENTATION = {
  OCCUPIED: { label: "Occupied", Icon: Users, className: "text-amber-300" },
  UNOCCUPIED: { label: "Empty", Icon: UserX, className: "text-muted-foreground" },
  UNKNOWN: {
    label: "Occupancy unknown",
    Icon: HelpCircle,
    className: "text-amber-400",
  },
} as const satisfies Record<
  PriorityQueueEntryDto["occupancy"],
  { label: string; Icon: typeof Users; className: string }
>

export function RankRow({
  entry,
  onAcknowledge,
  isAcknowledging,
}: {
  entry: PriorityQueueEntryDto
  onAcknowledge?: (incidentId: string) => void
  isAcknowledging?: boolean
}) {
  // The duration ticks locally between server events so the row never looks
  // frozen. Deriving it from a clock (rather than mirroring the prop into
  // state) means a new server value is picked up without a resync effect.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const startedAtMs = Date.parse(entry.startedAt)
  const elapsed = Number.isFinite(startedAtMs)
    ? Math.max(
        entry.criticalDurationSeconds,
        Math.floor((now - startedAtMs) / 1000)
      )
    : entry.criticalDurationSeconds

  const occupancy = OCCUPANCY_PRESENTATION[entry.occupancy]

  return (
    <li
      data-testid={`rank-row-${entry.rank}`}
      className={cn(
        "flex flex-col gap-2 border-l-4 py-3 pr-3 pl-3",
        entry.acknowledged
          ? "border-l-sky-500/60 bg-sky-950/10"
          : "border-l-red-500/70 bg-red-950/10"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-label={`Rank ${entry.rank}`}
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-xs font-semibold"
        >
          {entry.rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-sm font-semibold">
              {entry.zoneName}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              risk {entry.riskScore.toFixed(1)} · priority{" "}
              <strong className="text-foreground">
                {entry.priorityScore.toFixed(1)}
              </strong>
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className={cn("inline-flex items-center gap-1", occupancy.className)}>
              <occupancy.Icon aria-hidden className="size-3" />
              {occupancy.label}
            </span>
            <span>critical for {formatDuration(elapsed)}</span>
            {entry.mainHazard && <span>main hazard: {entry.mainHazard.toLowerCase()}</span>}
            <span
              className={cn(
                "inline-flex items-center gap-1",
                entry.acknowledged ? "text-sky-300" : "text-red-300"
              )}
            >
              {entry.acknowledged ? (
                <>
                  <CheckCircle2 aria-hidden className="size-3" />
                  acknowledged
                  {entry.acknowledgedByName ? ` by ${entry.acknowledgedByName}` : ""}
                </>
              ) : (
                "unacknowledged"
              )}
            </span>
          </div>
        </div>

        {!entry.acknowledged && onAcknowledge && (
          <button
            type="button"
            onClick={() => onAcknowledge(entry.incidentId)}
            disabled={isAcknowledging}
            className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            Acknowledge
          </button>
        )}
      </div>

      <BreakdownChips breakdown={entry.breakdown} />

      <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
        {entry.reasons.map((reason) => (
          <li key={reason}>· {reason}</li>
        ))}
      </ul>
    </li>
  )
}

export function PriorityQueuePanel({
  queue,
  isLoading,
  error,
  onAcknowledge,
  acknowledgingId,
}: {
  queue: PriorityQueueEntryDto[] | undefined
  isLoading: boolean
  error: unknown
  onAcknowledge?: (incidentId: string) => void
  acknowledgingId?: string | null
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <ListOrdered aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Response priority</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Ranked by the backend — the client never re-sorts
        </span>
      </header>

      {isLoading && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Loading the priority queue…
        </p>
      )}

      {!isLoading && error != null && (
        <p role="alert" className="px-4 py-6 text-sm text-red-300">
          Could not load the priority queue.
        </p>
      )}

      {!isLoading && !error && (queue?.length ?? 0) === 0 && (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No active critical incidents.
        </p>
      )}

      <ul className="divide-y divide-border/40">
        {queue?.map((entry) => (
          <RankRow
            key={entry.incidentId}
            entry={entry}
            {...(onAcknowledge ? { onAcknowledge } : {})}
            isAcknowledging={acknowledgingId === entry.incidentId}
          />
        ))}
      </ul>
    </Card>
  )
}
