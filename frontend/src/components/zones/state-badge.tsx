import { AlertTriangle, CheckCircle2, HelpCircle, Siren } from "lucide-react"
import type { ZoneState } from "@scsrg/shared"

import { cn } from "@/lib/utils"

/**
 * `satisfies Record<ZoneState, …>` is deliberate: adding a fifth zone state
 * must break the build here rather than silently render nothing.
 */
const STATE_PRESENTATION = {
  SAFE: {
    label: "Safe",
    Icon: CheckCircle2,
    className: "border-emerald-600/40 bg-emerald-950/40 text-emerald-300",
  },
  WARNING: {
    label: "Warning",
    Icon: AlertTriangle,
    className: "border-amber-500/50 bg-amber-950/40 text-amber-300",
  },
  CRITICAL: {
    label: "Critical",
    Icon: Siren,
    className: "border-red-500/60 bg-red-950/50 text-red-300",
  },
  OFFLINE: {
    label: "Offline",
    Icon: HelpCircle,
    className: "border-zinc-600/50 bg-zinc-900/60 text-zinc-400",
  },
} as const satisfies Record<
  ZoneState,
  { label: string; Icon: typeof Siren; className: string }
>

export function StateBadge({
  state,
  className,
}: {
  state: ZoneState
  className?: string
}) {
  const { label, Icon, className: stateClassName } = STATE_PRESENTATION[state]

  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
        stateClassName,
        className
      )}
    >
      {/* Icon + label + border weight, so state never depends on colour alone. */}
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}

