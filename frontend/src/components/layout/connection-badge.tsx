import { RadioTower, RefreshCw, WifiOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { useConnectionStatus } from "@/hooks/use-socket"
import type { ConnectionStatus } from "@/lib/socket"

const PRESENTATION = {
  LIVE: {
    label: "Live",
    Icon: RadioTower,
    className: "border-emerald-600/50 bg-emerald-950/40 text-emerald-300",
    description: "Receiving real-time updates",
  },
  RECONNECTING: {
    label: "Reconnecting",
    Icon: RefreshCw,
    className: "border-amber-500/60 bg-amber-950/40 text-amber-300",
    description: "Connection dropped — retrying with backoff",
  },
  OFFLINE: {
    label: "Offline",
    Icon: WifiOff,
    className: "border-zinc-600/60 bg-zinc-900/60 text-zinc-400",
    description: "No live connection; data may be stale",
  },
} as const satisfies Record<
  ConnectionStatus,
  { label: string; Icon: typeof RadioTower; className: string; description: string }
>

/** Icon **and** text — the state never depends on colour alone. */
export function ConnectionBadge({ className }: { className?: string }) {
  const status = useConnectionStatus()
  const { label, Icon, className: statusClassName, description } =
    PRESENTATION[status]

  return (
    <span
      title={description}
      aria-label={`Connection status: ${label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium tracking-wide uppercase",
        statusClassName,
        className
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-3.5", status === "RECONNECTING" && "animate-spin")}
      />
      {label}
    </span>
  )
}
