import type { ZoneState } from "@scsrg/shared"

import { cn } from "@/lib/utils"
import { ZONE_STATE_PRESENTATION } from "./zone-presentation"

export function StateBadge({
  state,
  className,
}: {
  state: ZoneState
  className?: string
}) {
  const { label, Icon, text, surface, border } = ZONE_STATE_PRESENTATION[state]

  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
        surface,
        border,
        text,
        className
      )}
    >
      {/* Icon + label + border weight, so state never depends on colour alone. */}
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}
